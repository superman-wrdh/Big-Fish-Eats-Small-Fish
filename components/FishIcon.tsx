import React from 'react';
import { FishVariant } from '../types';

interface FishIconProps {
  width: number;
  height: number;
  color: string;
  direction: 'left' | 'right';
  isPlayer?: boolean;
  variant?: FishVariant;
}

export const FishIcon: React.FC<FishIconProps> = ({ 
  width, 
  height, 
  color, 
  direction, 
  isPlayer,
  variant = 'standard'
}) => {
  const transform = direction === 'right' ? 'scale(-1, 1)' : 'scale(1, 1)';
  
  // Player always looks a bit special (glowing), but follows the shape
  const filter = isPlayer 
    ? 'drop-shadow(0 0 5px rgba(255, 255, 255, 0.6))' 
    : 'drop-shadow(0 2px 2px rgba(0,0,0,0.2))';

  // Common Eye Component
  const Eye = ({ cx, cy, r }: { cx: number, cy: number, r: number }) => (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="white" />
      <circle cx={cx + (r*0.4)} cy={cy} r={r*0.4} fill="black" />
      {/* Shinies */}
      <circle cx={cx - (r*0.3)} cy={cy - (r*0.3)} r={r*0.25} fill="white" opacity="0.8" />
    </g>
  );

  const renderBody = () => {
    switch (variant) {
      case 'round': // Cute / Puffer
        return (
          <>
            {/* Tail */}
            <path d="M75,30 L95,15 L95,45 Z" fill={color} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
            {/* Fins */}
            <ellipse cx="45" cy="45" rx="10" ry="6" fill={color} opacity="0.8" />
            <ellipse cx="45" cy="15" rx="10" ry="6" fill={color} opacity="0.8" />
            {/* Body */}
            <circle cx="45" cy="30" r="30" fill={color} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
            {/* Big Cute Eye */}
            <Eye cx={25} cy={25} r={9} />
            {/* Mouth */}
            <path d="M18,35 Q22,38 26,35" fill="none" stroke="black" strokeWidth="1.5" opacity="0.5" />
          </>
        );

      case 'sharp': // Aggressive / Shark-like
        return (
          <>
            {/* Tail */}
            <path d="M80,30 L100,0 L100,60 Z" fill={color} />
            {/* Dorsal Fin */}
            <path d="M40,20 L55,0 L70,20 Z" fill={color} />
            {/* Body */}
            <path d="M0,35 Q20,10 60,15 T100,30 L100,40 Q60,55 20,45 T0,35" fill={color} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
            {/* Eye (Angry/Small) */}
            <circle cx="20" cy="25" r="4" fill="white" />
            <circle cx="20" cy="25" r="1.5" fill="black" />
            {/* Gills */}
            <path d="M35,30 L35,40 M40,28 L40,42" stroke="rgba(0,0,0,0.2)" strokeWidth="2" />
          </>
        );

      case 'blocky': // Goofy / Box fish
        return (
          <>
            {/* Tail */}
            <rect x="85" y="20" width="15" height="20" fill={color} rx="2" />
            {/* Body */}
            <rect x="10" y="10" width="75" height="40" rx="10" fill={color} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
            {/* Lips */}
            <path d="M10,30 L0,25 L0,35 Z" fill="#ff6b6b" />
            {/* Goofy Eyes (Asymmetric) */}
            <circle cx="25" cy="22" r="6" fill="white" />
            <circle cx="25" cy="22" r="2" fill="black" />
            <circle cx="35" cy="22" r="4" fill="white" />
            <circle cx="35" cy="22" r="1" fill="black" />
            {/* Fin */}
            <path d="M50,30 L65,40 L45,45 Z" fill="rgba(0,0,0,0.2)" />
          </>
        );

      case 'standard':
      default:
        return (
          <>
            {/* Tail */}
            <path d="M85,30 L100,10 L100,50 Z" fill={color} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
            {/* Body */}
            <ellipse cx="45" cy="30" rx="45" ry="25" fill={color} stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
            {/* Eye */}
            <Eye cx={20} cy={20} r={6} />
            {/* Fin */}
            <path d="M45,30 L60,45 L40,45 Z" fill="rgba(0,0,0,0.2)" />
            {/* Stripes */}
            <path d="M50,10 Q60,30 50,50" stroke="rgba(255,255,255,0.3)" strokeWidth="3" fill="none"/>
            <path d="M70,15 Q80,30 70,45" stroke="rgba(255,255,255,0.3)" strokeWidth="3" fill="none"/>
          </>
        );
    }
  };

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 100 60"
      style={{
        transform: transform,
        filter: filter,
        overflow: 'visible'
      }}
    >
      {renderBody()}
    </svg>
  );
};