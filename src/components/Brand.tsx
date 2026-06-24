export function RadarMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="14" stroke="#16c79a" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="9" stroke="#16c79a" strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="4" stroke="#16c79a" strokeOpacity="0.7" strokeWidth="1.5" />
      <defs>
        <linearGradient id="sweep" x1="16" y1="16" x2="30" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3ee6bd" />
          <stop offset="1" stopColor="#3ee6bd" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M16 16 L30 6 A14 14 0 0 0 16 2 Z" fill="url(#sweep)" opacity="0.9" />
      <circle cx="22.5" cy="10.5" r="1.8" fill="#3ee6bd" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <RadarMark />
      {!compact && (
        <span className="font-extrabold tracking-tight">
          Y&P<span className="text-radar"> 레이더</span>
        </span>
      )}
    </span>
  );
}
