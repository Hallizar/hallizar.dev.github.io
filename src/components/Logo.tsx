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
      <path d="M-0.000422476 51.9042V43.832H7.34529V29.1406H14.6103V22.6828H7.34529V8.15282H-0.000422476V-0.000115616H8.15251V7.3456H15.4175V21.9563H22.0367V7.3456H29.3017V-0.000115616H37.5354V8.15282H30.1089V22.6828H22.8439V29.1406H30.1089V43.832H37.5354V51.9042H29.3017V44.6392H22.0367V29.9478H15.4175V44.6392H8.15251V51.9042H-0.000422476Z" fill="black"/>
    </svg>
  );
}

export default Logo;
