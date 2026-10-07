import React from 'react';

interface LogoProps {
  className?: string;
  size?: number | string;
  color?: string;
}

export function Logo({ className = '', size = 24, color = 'currentColor' }: LogoProps) {
  return (
    <svg
      viewBox="0 0 72 96"
      width={size}
      height={typeof size === 'number' ? Math.round((size * 96) / 72) : size}
      fill={color}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Top T-bar and vertical stem */}
      <path d="M 17 0 H 55 V 14 H 43 V 37 L 36 44 L 29 37 V 14 H 17 Z" />
      {/* Bottom inverted T-bar and vertical stem */}
      <path d="M 17 96 H 55 V 82 H 43 V 59 L 36 52 L 29 59 V 82 H 17 Z" />
      {/* Left pillar and horizontal inward arm */}
      <path d="M 0 16 H 14 V 41 H 25 L 32 48 L 25 55 H 14 V 80 H 0 Z" />
      {/* Right pillar and horizontal inward arm */}
      <path d="M 58 16 H 72 V 80 H 58 V 55 H 47 L 40 48 L 47 41 H 58 Z" />
    </svg>
  );
}

export default Logo;
