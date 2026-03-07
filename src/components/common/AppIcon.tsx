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
  const accentId = `${iconId}-accent`;
  const sheenId = `${iconId}-sheen`;

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
          <stop stopColor="#0F172A" />
          <stop offset="0.58" stopColor="#1E293B" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
        <linearGradient id={accentId} x1="20" y1="18" x2="28" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22D3EE" />
          <stop offset="1" stopColor="#818CF8" />
        </linearGradient>
        <linearGradient id={sheenId} x1="12" y1="8" x2="44" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.34" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${bgId})`} />
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="17.25" stroke="#FFFFFF" strokeOpacity="0.08" strokeWidth="1.5" />
      <path
        d="M8 13C8 9.134 11.134 6 15 6H49C52.866 6 56 9.134 56 13V22C49.708 19.902 41.928 18.75 32.5 18.75C22.69 18.75 14.492 20 8 22.25V13Z"
        fill={`url(#${sheenId})`}
      />

      <g>
        <path
          d="M19 16C19 13.791 20.791 12 23 12H38.5L47 20.5V48C47 50.209 45.209 52 43 52H23C20.791 52 19 50.209 19 48V16Z"
          fill="#F8FAFC"
        />
        <path d="M38.5 12V20C38.5 22.209 40.291 24 42.5 24H47L38.5 12Z" fill="#DDE6FF" />
        <rect x="22" y="18" width="6" height="27" rx="3" fill={`url(#${accentId})`} />
        <rect x="31" y="21" width="9" height="3" rx="1.5" fill="#1E293B" fillOpacity="0.94" />
        <rect x="31" y="29" width="11" height="3" rx="1.5" fill="#475569" fillOpacity="0.9" />
        <rect x="31" y="37" width="9" height="3" rx="1.5" fill="#64748B" fillOpacity="0.88" />
        <path d="M22 48C27 43.7 39 43.7 44 48" stroke="#C7D2FE" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
