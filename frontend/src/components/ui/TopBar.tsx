import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { useT } from "../../i18n"
import { GearIcon } from "./Icon"
import LanguageToggle from "./LanguageToggle"

/** Shared top bar: app name, the language switch, and (once signed in) Settings. */
export default function TopBar({
  showSettings = false, title, right,
}: { showSettings?: boolean; title?: string; right?: ReactNode }) {
  const { t } = useT()
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 max-w-5xl mx-auto w-full">
      <span className="font-display text-lg sm:text-xl font-semibold text-leaf-700 dark:text-leaf-500 truncate">
        🌱 {title ?? t("app.name")}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {right}
        <LanguageToggle />
        {showSettings && (
          <Link
            to="/settings"
            aria-label={t("common.settings")}
            className="p-2 rounded-full bg-white/80 dark:bg-gray-800/80 surface text-gray-600 dark:text-gray-300 hover:text-leaf-700"
          >
            <GearIcon className="w-5 h-5" />
          </Link>
        )}
      </div>
    </header>
  )
}
