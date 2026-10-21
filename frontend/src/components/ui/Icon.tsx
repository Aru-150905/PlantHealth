type IconProps = { className?: string }

const base = "stroke-current fill-none"

/** Small inline-SVG icon set, stroke-only so they inherit `currentColor` and work in
 * both themes with no separate dark variants. Keep new icons to this same 24x24,
 * stroke-width 1.75 style so additions don't look mismatched. */
export function SunIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.75} className={`${base} ${className}`}>
      <circle cx="12" cy="12" r="4.5" />
      <path strokeLinecap="round" d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </svg>
  )
}

export function MoonIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.75} className={`${base} ${className}`}>
      <path strokeLinejoin="round" d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5Z" />
    </svg>
  )
}

export function GearIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.75} className={`${base} ${className}`}>
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 13.5a7.8 7.8 0 0 0 0-3l1.9-1.3-1.5-2.6-2.2.6a7.7 7.7 0 0 0-2.6-1.5L14.6 3h-3l-.4 2.2a7.7 7.7 0 0 0-2.6 1.5l-2.2-.6-1.5 2.6L6.6 10a7.8 7.8 0 0 0 0 3l-1.9 1.3 1.5 2.6 2.2-.6a7.7 7.7 0 0 0 2.6 1.5l.4 2.2h3l.4-2.2a7.7 7.7 0 0 0 2.6-1.5l2.2.6 1.5-2.6Z" />
    </svg>
  )
}

export function RefreshIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.75} className={`${base} ${className}`}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8 8 0 0 0-14.3-4.3M4 5v4h4M4 13a8 8 0 0 0 14.3 4.3M20 19v-4h-4" />
    </svg>
  )
}

export function LogoutIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.75} className={`${base} ${className}`}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 16l4-4-4-4M20 12H9" />
    </svg>
  )
}

export function WarningIcon({ className = "w-5 h-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" strokeWidth={1.75} className={`${base} ${className}`}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 16.5h.01M10.3 3.9 2.6 17.5A1.5 1.5 0 0 0 3.9 20h16.2a1.5 1.5 0 0 0 1.3-2.5L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z" />
    </svg>
  )
}
