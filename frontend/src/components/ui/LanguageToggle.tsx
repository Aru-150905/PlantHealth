import { SUPPORTED_LOCALES, useT } from "../../i18n"

/** The always-visible English | हिन्दी switch — on every screen, before and after login,
 * so a farmer never has to find Settings to read the app in their language. */
export default function LanguageToggle() {
  const { locale, setLocale, t } = useT()
  return (
    <div role="group" aria-label={t("lang.switch")} className="inline-flex rounded-full bg-white/80 dark:bg-gray-800/80 p-0.5 surface text-sm">
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-pressed={locale === l.code}
          onClick={() => setLocale(l.code)}
          className={`px-3 py-1.5 rounded-full font-medium transition-colors cursor-pointer ${
            locale === l.code
              ? "bg-leaf-600 text-white"
              : "text-gray-600 dark:text-gray-300 hover:text-leaf-700 dark:hover:text-leaf-500"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
