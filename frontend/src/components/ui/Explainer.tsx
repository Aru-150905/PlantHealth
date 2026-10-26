import { useId, useState, type ReactNode } from "react"

/**
 * A small "?" next to a technical term in the lab view: tap for one plain sentence. Keeps the
 * lab screen precise (the term stays) while making it less dense for someone who doesn't
 * live in the jargon. English only — the lab view isn't translated (see i18n/hi.ts).
 */
export default function Explainer({ term, children }: { term: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`What is ${term}?`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="ml-1 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 text-xs font-bold leading-none cursor-pointer hover:bg-leaf-100 hover:text-leaf-700"
      >
        ?
      </button>
      {open && (
        <span
          id={id} role="note"
          className="absolute z-20 left-1/2 -translate-x-1/2 top-7 w-64 rounded-xl bg-gray-900 text-white text-xs font-normal normal-case tracking-normal leading-snug p-3 shadow-lg"
        >
          <span className="font-semibold">{term}: </span>{children}
        </span>
      )}
    </span>
  )
}
