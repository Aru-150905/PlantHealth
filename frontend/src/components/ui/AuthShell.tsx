import type { ReactNode } from "react"
import { DECORATIVE_LOOK } from "../../lib/plantLook"
import PlantStage from "../plant/PlantStage"
import TopBar from "./TopBar"

/** Login/register layout: the decorative 3D plant beside the form on wide screens, above
 * it (smaller) on phones. */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh ambient-leaf-bg flex flex-col">
      <TopBar />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pb-10 grid md:grid-cols-2 gap-4 md:gap-8 items-center">
        {/* one plant (one GPU context), smaller on phones via PlantStage's responsive height */}
        <div className="-mb-2 md:mb-0"><PlantStage look={DECORATIVE_LOOK} size="card" /></div>
        <div className="w-full max-w-md mx-auto">{children}</div>
      </main>
    </div>
  )
}

export const inputClass =
  "w-full rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900/40 px-4 py-3 text-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-500/30"
export const labelClass = "text-base font-medium text-gray-700 dark:text-gray-300"
