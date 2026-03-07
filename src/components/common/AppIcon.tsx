import { useId } from 'react';

type AppIconProps = {
  className?: string;
  decorative?: boolean;
  title?: string;
};

export function AppIcon({
  className,
  decorative = false,
  title = 'PDF Reader Pro',
}: AppIconProps) {
  const iconId = useId().replace(/:/g, '');
  const bgId = `${iconId}-bg`;
  const glowId = `${iconId}-glow`;
  const accentId = `${iconId}-accent`;
  const shadowId = `${iconId}-shadow`;

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
    >
      <defs>
        <linearGradient id={bgId} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#071A33" />
          <stop offset="0.55" stopColor="#123F74" />
          <stop offset="1" stopColor="#0F8ACF" />
        </linearGradient>
        <radialGradient id={glowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(47 15) rotate(130) scale(30 25)">
          <stop stopColor="#67E8F9" stopOpacity="0.34" />
          <stop offset="1" stopColor="#67E8F9" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={accentId} x1="24" y1="19" x2="28" y2="39" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22D3EE" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
        <filter id={shadowId} x="15" y="10" width="35" height="42" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#020617" floodOpacity="0.22" />
        </filter>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${bgId})`} />
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="17.25" stroke="#FFFFFF" strokeOpacity="0.08" strokeWidth="1.5" />
      <circle cx="47" cy="15" r="19" fill={`url(#${glowId})`} />
      <circle cx="14" cy="52" r="15" fill="#0B2B4B" fillOpacity="0.34" />

      <g opacity="0.24" transform="rotate(-8 26 31)">
        <rect x="16.5" y="17" width="23.5" height="30" rx="5.5" fill="#E0ECFF" />
      </g>

      <g filter={`url(#${shadowId})`}>
        <rect x="20" y="13" width="24" height="34" rx="6" fill="#F8FAFC" />
        <path d="M35.5 13H38C41.314 13 44 15.686 44 19V21.5H41.5C38.186 21.5 35.5 18.814 35.5 15.5V13Z" fill="#D9E6FF" />
        <rect x="23" y="18" width="4.5" height="18" rx="2.25" fill={`url(#${accentId})`} />
        <rect x="30" y="19.5" width="9.5" height="3" rx="1.5" fill="#20324A" />
        <rect x="30" y="27.25" width="11" height="3" rx="1.5" fill="#5B6B80" />
        <rect x="30" y="35" width="8.5" height="3" rx="1.5" fill="#8291A7" />
        <path d="M24.5 42C28.6 38.9 35.4 38.9 39.5 42" stroke="#B9CCFF" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
