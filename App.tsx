import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FishEntity, GameStatus, Particle, FishVariant } from './types';
import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  INITIAL_PLAYER_SIZE, 
  MAX_PLAYER_SIZE, 
  PLAYER_SPEED, 
  FISH_COLORS, 
  PLAYER_COLOR 
} from './constants';
import { FishIcon } from './components/FishIcon';
import { Play, Pause, RefreshCw, Trophy, Skull, Volume2, VolumeX } from 'lucide-react';

export default function App() {
  // --- Game State Refs (Mutable for performance in loop) ---
  const playerRef = useRef<FishEntity>({
    id: 'player',
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    width: INITIAL_PLAYER_SIZE,
    height: INITIAL_PLAYER_SIZE * 0.6,
    speed: PLAYER_SPEED,
    direction: 'left',
    color: PLAYER_COLOR,
    type: 'player',
    variant: 'standard'
  });

  const enemiesRef = useRef<FishEntity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const keysPressed = useRef<Set<string>>(new Set());
  const frameId = useRef<number>(0);
  const lastSpawnTime = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const hasWonRef = useRef<boolean>(false); // Track if we've already triggered the win modal
  
  // Difficulty Ref (to access in loop without dependencies)
  const difficultyRef = useRef<number>(1);

  // Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ambienceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isMutedRef = useRef<boolean>(false);

  // --- React State (For rendering UI) ---
  const [status, setStatus] = useState<GameStatus>('start');
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState(1); // 1-10
  const [isMuted, setIsMuted] = useState(false);
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  
  // We use a dummy state to force re-render on every frame request
  const [, setTick] = useState(0);

  // --- Audio System ---

  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const startAmbience = useCallback(() => {
    if (isMutedRef.current || !audioCtxRef.current) return;
    
    // Stop existing if any
    if (ambienceNodeRef.current) {
        try { ambienceNodeRef.current.stop(); } catch(e) {}
    }

    const ctx = audioCtxRef.current;
    
    // Generate Brown Noise for Underwater Ambience
    const bufferSize = ctx.sampleRate * 2; // 2 seconds loop
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; 
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // Lowpass filter for "muffled" underwater sound
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300; 

    const gain = ctx.createGain();
    gain.gain.value = 0.1; // Subtle background volume

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
    ambienceNodeRef.current = noise;
  }, []);

  const stopAmbience = useCallback(() => {
    if (ambienceNodeRef.current) {
        try { ambienceNodeRef.current.stop(); } catch(e) {}
        ambienceNodeRef.current = null;
    }
  }, []);

  const playEatSound = useCallback(() => {
    if (isMutedRef.current || !audioCtxRef.current) return;
    const ctx = audioCtxRef.current;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Frequency sweep from high to low (gulp sound)
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }, []);

  const toggleMute = () => {
      const newVal = !isMuted;
      setIsMuted(newVal);
      isMutedRef.current = newVal;
      if (newVal) stopAmbience();
      else if (status === 'playing') startAmbience();
  };

  // --- Helpers ---
  
  const spawnEnemy = useCallback(() => {
    // 1. GLOBAL POPULATION CAP
    // Don't clutter the screen. Max 25 enemies total.
    if (enemiesRef.current.length >= 25) return;

    const playerSize = playerRef.current.width;
    const diff = difficultyRef.current;

    // 2. DANGEROUS FISH CAP
    // Calculate how many fish are bigger than the player
    const dangerousFishCount = enemiesRef.current.filter(e => e.width > playerSize).length;
    
    // Allowed dangerous fish increases slightly with difficulty, but capped reasonably.
    // Level 1: 2 big fish max. Level 10: 5 big fish max.
    const maxDangerousAllowed = 2 + Math.floor(diff / 3);
    const canSpawnDangerous = dangerousFishCount < maxDangerousAllowed;

    const isLeft = Math.random() > 0.5;
    const direction = isLeft ? 'right' : 'left';
    const startX = isLeft ? -150 : GAME_WIDTH + 150;
    const startY = Math.random() * (GAME_HEIGHT - 50) + 25;
    
    let width;
    let variant: FishVariant = 'standard';

    // Decide Size
    const spawnRoll = Math.random();
    // Probability of trying to spawn a big fish based on difficulty (0.1 to 0.5)
    const tryBigSpawn = spawnRoll < (0.1 + diff * 0.04);

    if (tryBigSpawn && canSpawnDangerous) {
        // Spawn Dangerous Fish
        // Cap size at 1.9x player size (Never double)
        // Min size 1.1x
        const sizeMultiplier = 1.1 + Math.random() * 0.8; 
        width = playerSize * sizeMultiplier;
        
        // Visuals for big fish
        variant = Math.random() > 0.5 ? 'sharp' : 'blocky';
    } else {
        // Spawn Food (Smaller)
        // Size between 0.3x and 0.9x of player
        width = Math.max(15, playerSize * (0.3 + Math.random() * 0.6));
        
        // Visuals for small fish
        const variants: FishVariant[] = ['round', 'standard', 'blocky'];
        variant = variants[Math.floor(Math.random() * variants.length)];
    }

    const height = width * 0.6; // Keep aspect ratio roughly consistent
    
    // Speed
    const speedBase = 2 + (diff * 0.3);
    const speed = (speedBase + Math.random() * 3) * (GAME_WIDTH / 1920);

    const newEnemy: FishEntity = {
      id: Math.random().toString(36).substr(2, 9),
      x: startX,
      y: startY,
      width,
      height,
      speed,
      direction,
      color: FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)],
      type: 'enemy',
      variant
    };

    enemiesRef.current.push(newEnemy);
  }, []);

  const spawnParticle = useCallback(() => {
    const p: Particle = {
        id: Math.random(),
        x: Math.random() * GAME_WIDTH,
        y: GAME_HEIGHT + 20,
        size: Math.random() * 5 + 2,
        speed: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.1
    };
    particlesRef.current.push(p);
  }, []);

  const checkCollision = (r1: FishEntity, r2: FishEntity) => {
    const hitboxScale = 0.6; 
    const dx = (r1.x + r1.width/2) - (r2.x + r2.width/2);
    const dy = (r1.y + r1.height/2) - (r2.y + r2.height/2);
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    const minDistance = (r1.width * hitboxScale + r2.width * hitboxScale) / 2;
    return distance < minDistance;
  };

  const resetGame = () => {
    // Sync ref
    difficultyRef.current = difficulty;
    hasWonRef.current = false;
    setShowVictoryModal(false);

    playerRef.current = {
      id: 'player',
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      width: INITIAL_PLAYER_SIZE,
      height: INITIAL_PLAYER_SIZE * 0.6,
      speed: PLAYER_SPEED,
      direction: 'left',
      color: PLAYER_COLOR,
      type: 'player',
      variant: 'standard'
    };
    enemiesRef.current = [];
    scoreRef.current = 0;
    setScore(0);
    setStatus('playing');

    // Start Audio
    initAudio();
    startAmbience();
  };

  const updateDifficulty = (val: number) => {
      setDifficulty(val);
      difficultyRef.current = val;
  };

  // --- Game Loop ---
  
  const update = useCallback((time: number) => {
    if (status !== 'playing') return;

    // 1. Update Player
    const player = playerRef.current;
    let dx = 0;
    let dy = 0;

    if (keysPressed.current.has('ArrowUp') || keysPressed.current.has('w')) dy -= player.speed;
    if (keysPressed.current.has('ArrowDown') || keysPressed.current.has('s')) dy += player.speed;
    if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('a')) {
      dx -= player.speed;
      player.direction = 'left';
    }
    if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('d')) {
      dx += player.speed;
      player.direction = 'right';
    }

    player.x = Math.max(0, Math.min(window.innerWidth - player.width, player.x + dx));
    player.y = Math.max(0, Math.min(window.innerHeight - player.height, player.y + dy));

    // 2. Spawn Enemies
    // Calculate spawn interval based on difficulty. 
    // Diff 1: ~1500ms, Diff 10: ~600ms (Slightly slower spawn rate overall to reduce chaos)
    const spawnInterval = Math.max(600, 1600 - (difficultyRef.current * 100));
    
    if (time - lastSpawnTime.current > spawnInterval) {
       spawnEnemy();
       lastSpawnTime.current = time;
    }

    // 3. Update Enemies & Particles
    particlesRef.current.forEach(p => { p.y -= p.speed; });
    particlesRef.current = particlesRef.current.filter(p => p.y > -50);
    if (Math.random() < 0.05) spawnParticle();

    const enemiesToRemove: Set<string> = new Set();
    
    enemiesRef.current.forEach(enemy => {
      // Move
      if (enemy.direction === 'right') enemy.x += enemy.speed;
      else enemy.x -= enemy.speed;

      // Despawn
      if (
        (enemy.direction === 'right' && enemy.x > window.innerWidth + 200) ||
        (enemy.direction === 'left' && enemy.x < -200)
      ) {
        enemiesToRemove.add(enemy.id);
      }

      // Collision
      if (checkCollision(player, enemy)) {
        if (player.width >= enemy.width) {
          // EAT
          enemiesToRemove.add(enemy.id);
          playEatSound();
          
          // Growth Logic: Coefficient is 0.1 of the enemy width
          const growth = enemy.width * 0.1;
          player.width += growth;
          player.height = player.width * 0.6;
          
          const points = Math.floor(enemy.width * 10 * difficultyRef.current); // More points for higher difficulty
          scoreRef.current += points;
          setScore(scoreRef.current);
          
          // WIN CONDITION (One-time trigger)
          if (player.width >= MAX_PLAYER_SIZE && !hasWonRef.current) {
            hasWonRef.current = true;
            setStatus('paused');
            setShowVictoryModal(true);
            // Optionally pause ambience or not. Let's keep it running for immersion or stop if you prefer 'freeze'.
            // stopAmbience(); 
          }
        } else {
          // DIE
          setStatus('gameover');
          stopAmbience();
        }
      }
    });

    enemiesRef.current = enemiesRef.current.filter(e => !enemiesToRemove.has(e.id));

    setTick(prev => prev + 1);
    frameId.current = requestAnimationFrame(update);
  }, [status, spawnEnemy, spawnParticle, playEatSound, stopAmbience]);


  // --- Event Listeners ---
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        setStatus(prev => {
          if (prev === 'playing') {
             stopAmbience();
             return 'paused';
          }
          if (prev === 'paused' && !showVictoryModal) { // Only allow unpause via P if not in victory modal
             startAmbience();
             return 'playing';
          }
          return prev;
        });
      }
      keysPressed.current.add(e.key);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [stopAmbience, startAmbience, showVictoryModal]);


  // --- Lifecycle ---

  useEffect(() => {
    if (status === 'playing') {
      frameId.current = requestAnimationFrame(update);
    }
    return () => cancelAnimationFrame(frameId.current);
  }, [status, update]);

  // --- Render ---

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-b from-cyan-400 to-blue-900 font-sans select-none">
      
      {/* Background Particles */}
      {particlesRef.current.map(p => (
          <div 
            key={p.id}
            className="absolute rounded-full bg-white blur-[1px]"
            style={{
                left: p.x,
                top: p.y,
                width: p.size,
                height: p.size,
                opacity: p.opacity,
                pointerEvents: 'none'
            }}
          />
      ))}

      {/* Game World */}
      {status !== 'start' && (
        <>
            {enemiesRef.current.map(enemy => (
                <div
                key={enemy.id}
                className="absolute transition-transform will-change-transform"
                style={{
                    left: enemy.x,
                    top: enemy.y,
                    width: enemy.width,
                    height: enemy.height,
                    zIndex: 10
                }}
                >
                <FishIcon 
                    width={enemy.width} 
                    height={enemy.height} 
                    color={enemy.color} 
                    direction={enemy.direction}
                    variant={enemy.variant}
                />
                </div>
            ))}

            <div
                className="absolute transition-transform will-change-transform"
                style={{
                left: playerRef.current.x,
                top: playerRef.current.y,
                width: playerRef.current.width,
                height: playerRef.current.height,
                zIndex: 20
                }}
            >
                <FishIcon 
                width={playerRef.current.width} 
                height={playerRef.current.height} 
                color={playerRef.current.color} 
                direction={playerRef.current.direction} 
                isPlayer
                variant="standard"
                />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-white font-bold text-sm drop-shadow-md whitespace-nowrap">
                    我
                </div>
            </div>

            {/* HUD */}
            <div className="absolute top-4 left-4 z-50 text-white font-bold text-2xl drop-shadow-md flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Trophy className="text-yellow-400" />
                    <span>积分: {score}</span>
                </div>
                <button 
                  onClick={toggleMute}
                  className="bg-black/20 p-2 rounded-full hover:bg-black/40 transition"
                >
                    {isMuted ? <VolumeX size={20}/> : <Volume2 size={20}/>}
                </button>
            </div>
             <div className="absolute top-4 right-4 z-50 text-white font-bold text-lg drop-shadow-md flex flex-col items-end">
                <span>体积: {Math.round(playerRef.current.width)} / {MAX_PLAYER_SIZE}</span>
                <span className="text-sm opacity-80">难度: {difficulty}</span>
            </div>
            
            {/* Standard Pause Screen (Only show if victory modal is NOT showing) */}
            {status === 'paused' && !showVictoryModal && (
               <div className="absolute inset-0 z-40 bg-black/30 flex items-center justify-center">
                   <div className="bg-black/70 text-white px-8 py-4 rounded-xl backdrop-blur text-2xl font-bold flex flex-col items-center gap-4">
                        <span>暂停</span>
                        <div className="text-sm font-normal text-gray-300">按 P 继续</div>
                        <button 
                            onClick={() => {
                                setStatus('playing');
                                startAmbience();
                            }}
                            className="mt-2 bg-orange-500 hover:bg-orange-600 px-6 py-2 rounded-full text-base"
                        >
                            继续游戏
                        </button>
                   </div>
               </div>
            )}

            {/* INVINCIBLE MODAL */}
            {status === 'paused' && showVictoryModal && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-blue-900/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="relative">
                        <Trophy className="w-32 h-32 text-yellow-300 mb-6 drop-shadow-[0_0_15px_rgba(253,224,71,0.5)] animate-pulse" />
                    </div>
                    <h2 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 mb-4 text-center">
                        你已经无敌了！
                    </h2>
                    <p className="text-2xl text-blue-100 mb-8 max-w-lg text-center">
                        你成为了这片海洋的霸主。
                    </p>
                    <div className="flex gap-6">
                        <button
                            onClick={() => { 
                                setShowVictoryModal(false);
                                setStatus('playing'); 
                                startAmbience(); // Ensure sound is on if it was stopped or paused
                            }}
                            className="flex items-center px-8 py-4 bg-green-500 text-white rounded-full font-bold text-xl hover:bg-green-600 hover:scale-105 transition-all shadow-xl"
                        >
                            <Play className="mr-2" /> 继续游戏
                        </button>
                        <button
                            onClick={() => { setStatus('start'); stopAmbience(); }}
                            className="flex items-center px-8 py-4 bg-white text-red-600 rounded-full font-bold text-xl hover:bg-gray-100 hover:scale-105 transition-all shadow-xl"
                        >
                            <RefreshCw className="mr-2" /> 结束游戏
                        </button>
                    </div>
                </div>
            )}
        </>
      )}

      {/* Start Screen */}
      {status === 'start' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <h1 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-500 mb-6 drop-shadow-lg">
            大鱼吃小鱼
          </h1>
          <div className="bg-white/10 p-8 rounded-xl border border-white/20 text-center shadow-2xl w-[450px]">
            <p className="text-white text-lg mb-6 leading-relaxed">
              使用 <kbd className="bg-white/20 px-2 py-1 rounded">方向键</kbd> 移动 <br/>
              吃掉小鱼变大 <br/>
              躲避大鱼生存
            </p>
            
            {/* Difficulty Slider */}
            <div className="mb-8 text-left">
                <div className="flex justify-between text-white mb-2 font-bold">
                    <span>难度: {difficulty}</span>
                    <span className="text-sm opacity-70 font-normal">
                        {difficulty < 4 ? '简单' : difficulty < 8 ? '普通' : '困难'}
                    </span>
                </div>
                <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    value={difficulty} 
                    onChange={(e) => updateDifficulty(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>少量敌人</span>
                    <span>极度混乱</span>
                </div>
            </div>

            <button
              onClick={() => resetGame()}
              className="group w-full relative inline-flex items-center justify-center px-8 py-3 text-lg font-bold text-white transition-all duration-200 bg-orange-500 font-pj rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-600 hover:bg-orange-600 hover:scale-105"
            >
              <Play className="mr-2 w-6 h-6" /> 开始游戏
            </button>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {status === 'gameover' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <Skull className="w-24 h-24 text-white mb-4 animate-bounce" />
          <h2 className="text-5xl font-bold text-white mb-2">游戏结束</h2>
          <p className="text-xl text-red-200 mb-8">你被大鱼吃掉了！</p>
          <div className="text-2xl text-white font-mono mb-8 bg-black/30 px-6 py-2 rounded-lg">
             最终得分: {score}
          </div>
          <button
            onClick={() => { setStatus('start'); stopAmbience(); }}
            className="flex items-center px-6 py-3 bg-white text-red-600 rounded-full font-bold hover:bg-gray-100 hover:scale-105 transition-all shadow-lg"
          >
            <RefreshCw className="mr-2" /> 返回菜单
          </button>
        </div>
      )}
    </div>
  );
}