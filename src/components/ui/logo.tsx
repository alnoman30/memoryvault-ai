// MemoryVault mark: a vault dial inside a rounded tile.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="10" fill="var(--accent)" />
      <circle cx="16" cy="16" r="7" stroke="var(--accent-ink)" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="2.2" fill="var(--accent-ink)" />
      <path
        d="M16 5.5v3M16 23.5v3M5.5 16h3M23.5 16h3"
        stroke="var(--accent-ink)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="font-display text-xl font-semibold tracking-tight">
        MemoryVault
      </span>
    </span>
  );
}
