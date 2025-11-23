export interface Position {
  x: number;
  y: number;
}

export type FishVariant = 'standard' | 'round' | 'sharp' | 'blocky';

export interface FishEntity {
  id: string;
  x: number;
  y: number;
  width: number; // Used for collision and rendering size
  height: number;
  speed: number;
  direction: 'left' | 'right';
  color: string;
  type: 'player' | 'enemy';
  variant: FishVariant;
}

export type GameStatus = 'start' | 'playing' | 'paused' | 'gameover' | 'victory';

export interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}