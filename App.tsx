import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FishEntity, GameStatus, Particle } from './types';
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
    type: 'player'
  });

  const enemiesRef = useRef<FishEntity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const keysPressed = useRef<Set<string>>(new Set());
  const frameId = useRef<number>(0);
  const lastSpawnTime = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  
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
    const isLeft = Math.random() > 0.5;
    const direction = isLeft ? 'right' : 'left';
    const startX = isLeft ? -150 : GAME_WIDTH + 150;
    const startY = Math.random() * (GAME_HEIGHT - 50) + 25;
    
    // Difficulty influences size probabilities
    // Diff 1: Mostly small/equal. Diff 10: Mostly dangerous.
    const diff = difficultyRef.current;
    
    // Probability of spawning a "Dangerous" (Bigger) fish
    // Range: 0.1 (Diff 1) to 0.6 (Diff 10)
    const dangerChance = 0.1 + (diff * 0.055); 
    
    const playerSize = playerRef.current.width;
    const sizeRoll = Math.random();
    let width;
    
    if (sizeRoll < dangerChance) {
        // Danger: Bigger than player
        // Min 1.1x player size, Max depends on difficulty (up to 3x at max diff)
        const maxScale = 1.2 + (diff * 0.2);
        width = playerSize * (1.1 + Math.random() * (maxScale - 1.1));
    } else {
        // Food or Neutral: Smaller or same size
        // 60% chance of being food (smaller) within this bracket
        if (Math.random() < 0.6) {
            width = Math.max(15, playerSize * (0.3 + Math.random() * 0.6)); // 0.3x to 0.9x
        } else {
            width = playerSize * (0.9 + Math.random() * 0.15); // 0.9x to 1.05x
        }
    }

    const height = width * 0.6;
    // Speed increases slightly with difficulty
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
      type: 'enemy'
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

    playerRef.current = {
      id: 'player',
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      width: INITIAL_PLAYER_SIZE,
      height: INITIAL_PLAYER_SIZE * 0.6,
      speed: PLAYER_SPEED,
      direction: 'left',
      color: PLAYER_COLOR,
      type: 'player'
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
    // Diff 1: ~1500ms, Diff 10: ~400ms
    const spawnInterval = Math.max(400, 1600 - (difficultyRef.current * 120));
    
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
          
          const growth = enemy.width * 0.1;
          player.width += growth;
          player.height = player.width * 0.6;
          
          const points = Math.floor(enemy.width * 10 * difficultyRef.current); // More points for higher difficulty
          scoreRef.current += points;
          setScore(scoreRef.current);
          
          if (player.width >= MAX_PLAYER_SIZE) {
            setStatus('victory');
            stopAmbience();
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
          if (prev === 'paused') {
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
  }, [stopAmbience, startAmbience]);


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
                />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-white font-bold text-sm drop-shadow-md whitespace-nowrap">
                    YOU
                </div>
            </div>

            {/* HUD */}
            <div className="absolute top-4 left-4 z-50 text-white font-bold text-2xl drop-shadow-md flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Trophy className="text-yellow-400" />
                    <span>Score: {score}</span>
                </div>
                <button 
                  onClick={toggleMute}
                  className="bg-black/20 p-2 rounded-full hover:bg-black/40 transition"
                >
                    {isMuted ? <VolumeX size={20}/> : <Volume2 size={20}/>}
                </button>
            </div>
             <div className="absolute top-4 right-4 z-50 text-white font-bold text-lg drop-shadow-md flex flex-col items-end">
                <span>Size: {Math.round(playerRef.current.width)} / {MAX_PLAYER_SIZE}</span>
                <span className="text-sm opacity-80">Difficulty: {difficulty}</span>
            </div>
            
            {status === 'paused' && (
               <div className="absolute inset-0 z-40 bg-black/30 flex items-center justify-center">
                   <div className="bg-black/70 text-white px-8 py-4 rounded-xl backdrop-blur text-2xl font-bold flex flex-col items-center gap-4">
                        <span>PAUSED</span>
                        <div className="text-sm font-normal text-gray-300">Press P to Resume</div>
                        <button 
                            onClick={() => {
                                setStatus('playing');
                                startAmbience();
                            }}
                            className="mt-2 bg-orange-500 hover:bg-orange-600 px-6 py-2 rounded-full text-base"
                        >
                            Resume
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
            Big Fish Eats Small Fish
          </h1>
          <div className="bg-white/10 p-8 rounded-xl border border-white/20 text-center shadow-2xl w-[450px]">
            <p className="text-white text-lg mb-6 leading-relaxed">
              Use <kbd className="bg-white/20 px-2 py-1 rounded">Arrow Keys</kbd> to move. <br/>
              Eat smaller fish to grow. <br/>
              Avoid bigger fish or get eaten!
            </p>
            
            {/* Difficulty Slider */}
            <div className="mb-8 text-left">
                <div className="flex justify-between text-white mb-2 font-bold">
                    <span>Difficulty: {difficulty}</span>
                    <span className="text-sm opacity-70 font-normal">
                        {difficulty < 4 ? 'Easy' : difficulty < 8 ? 'Normal' : 'Hard'}
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
                    <span>Few Enemies</span>
                    <span>Chaos</span>
                </div>
            </div>

            <button
              onClick={() => resetGame()}
              className="group w-full relative inline-flex items-center justify-center px-8 py-3 text-lg font-bold text-white transition-all duration-200 bg-orange-500 font-pj rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-600 hover:bg-orange-600 hover:scale-105"
            >
              <Play className="mr-2 w-6 h-6" /> Start Game
            </button>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {status === 'gameover' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <Skull className="w-24 h-24 text-white mb-4 animate-bounce" />
          <h2 className="text-5xl font-bold text-white mb-2">GAME OVER</h2>
          <p className="text-xl text-red-200 mb-8">You were eaten by a bigger fish!</p>
          <div className="text-2xl text-white font-mono mb-8 bg-black/30 px-6 py-2 rounded-lg">
             Final Score: {score}
          </div>
          <button
            onClick={() => { setStatus('start'); stopAmbience(); }}
            className="flex items-center px-6 py-3 bg-white text-red-600 rounded-full font-bold hover:bg-gray-100 hover:scale-105 transition-all shadow-lg"
          >
            <RefreshCw className="mr-2" /> Menu
          </button>
        </div>
      )}

      {/* Victory Screen */}
      {status === 'victory' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-blue-900/80 backdrop-blur-md animate-in fade-in duration-300">
           <div className="relative">
             <Trophy className="w-32 h-32 text-yellow-300 mb-6 drop-shadow-[0_0_15px_rgba(253,224,71,0.5)] animate-pulse" />
           </div>
          <h2 className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 mb-4">
            YOU ARE INVINCIBLE!
          </h2>
          <p className="text-2xl text-blue-100 mb-8 max-w-lg text-center">
            You have become the apex predator of the ocean.
          </p>
           <div className="text-3xl text-white font-mono mb-8 bg-black/30 px-8 py-3 rounded-lg border border-yellow-500/30">
             Score: {score}
          </div>
          <button
            onClick={() => { setStatus('start'); stopAmbience(); }}
            className="flex items-center px-8 py-4 bg-yellow-500 text-blue-900 rounded-full font-bold text-xl hover:bg-yellow-400 hover:scale-105 transition-all shadow-xl"
          >
            <RefreshCw className="mr-2" /> Play Again
          </button>
        </div>
      )}
    </div>
  );
}