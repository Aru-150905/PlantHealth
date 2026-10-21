import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"

type ToastKind = "success" | "error" | "info"
type ToastItem = { id: number; kind: ToastKind; message: string }

const ToastContext = createContext<((kind: ToastKind, message: string) => void) | null>(null)

const KIND_STYLES: Record<ToastKind, string> = {
  success: "bg-leaf-600 text-white",
  error: "bg-stress-600 text-white",
  info: "bg-gray-800 text-white dark:bg-gray-700",
}

/** App-wide toast host. Transient, auto-dismissing notices (saved, sent, failed) —
 * for state that should persist on screen (a tier-cap notice, a form field error),
 * keep using inline text instead. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++
    setItems((cur) => [...cur, { id, kind, message }])
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto max-w-sm w-full sm:w-auto rounded-xl shadow-lg px-4 py-2.5 text-sm font-medium animate-toast-in ${KIND_STYLES[t.kind]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return {
    success: (message: string) => ctx("success", message),
    error: (message: string) => ctx("error", message),
    info: (message: string) => ctx("info", message),
  }
}
