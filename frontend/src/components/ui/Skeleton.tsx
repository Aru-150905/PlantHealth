/** Shape-matched loading placeholder — replaces plain "Loading…" text so the layout
 * doesn't jump once real content arrives. Compose with className for size/shape. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-skeleton rounded-lg bg-gray-200 dark:bg-gray-700 ${className}`} />
}

/** A generic "card about to have content" skeleton — matches the app's
 * `bg-white dark:bg-gray-800 rounded-2xl surface` card shell. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl surface p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  )
}
