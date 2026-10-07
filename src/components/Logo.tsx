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
      <path d="M1 96V81.07H14.5863V53.8974H28.0233V41.9533H14.5863V15.0793H1V0H16.0793V13.5863H29.5163V40.6096H41.7589V13.5863H55.196V0H70.4246V15.0793H56.689V41.9533H43.2519V53.8974H56.689V81.07H70.4246V96H55.196V82.563H41.7589V55.3904H29.5163V82.563H16.0793V96H1Z" fill="black"/>
  );
}

export default Logo;
