import React from 'react';

interface FishIconProps {
  width: number;
  height: number;
  color: string;
  direction: 'left' | 'right';
  isPlayer?: boolean;
}

export const FishIcon: React.FC<FishIconProps> = ({ width, height, color, direction, isPlayer }) => {
  // Simple fish shape SVG
  const transform = direction === 'right' ? 'scale(-1, 1)' : 'scale(1, 1)';

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 60"
      style={{
        transform: transform,
        filter: isPlayer ? 'drop-shadow(0 0 5px rgba(255, 255, 255, 0.5))' : 'none',
        overflow: 'visible'
      }}
    >
      {/* Tail */}
      <path
        d="M85,30 L100,10 L100,50 Z"
        fill={color}
        stroke="#00000033"
        strokeWidth="2"
      />
      {/* Body */}
      <ellipse
        cx="45"
        cy="30"
        rx="45"
        ry="25"
        fill={color}
        stroke="#00000033"
        strokeWidth="2"
      />
      {/* Eye */}
      <circle cx="20" cy="20" r="5" fill="white" />
      <circle cx="18" cy="20" r="2" fill="black" />
      
      {/* Fin */}
      <path
        d="M45,30 L60,45 L40,45 Z"
        fill="rgba(0,0,0,0.2)"
      />
      
      {/* Details/Scales if player */}
      {isPlayer && (
        <path d="M30,10 Q40,5 50,10" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none"/>
      )}
    </svg>
  );
};