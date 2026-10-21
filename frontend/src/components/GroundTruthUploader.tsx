import { useEffect, useRef, useState } from "react"
import { api, errorMessage, type GroundTruthUpload } from "../api/client"
import { useToast } from "./ui/Toast"

/** Section 7's ground-truth assay data (RWC / proline / MDA / chlorophyll with timepoints)
 * — flagged as available back in lab onboarding but left unwired until now. Stores and
 * lists uploads; not yet wired into model recalibration (see backend/api/README.md). */
export default function GroundTruthUploader() {
  const toast = useToast()
  const [uploads, setUploads] = useState<GroundTruthUpload[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.listGroundTruthAssays().then(setUploads).catch(() => setUploads([]))
  }, [])

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await api.uploadGroundTruthAssay(file)
      setUploads((cur) => [uploaded, ...(cur ?? [])])
      toast.success(`${uploaded.filename} uploaded — ${uploaded.row_count} rows.`)
    } catch (err) {
      toast.error(errorMessage(err, "Upload failed."))
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  async function onDelete(id: string) {
    try {
      await api.deleteGroundTruthAssay(id)
      setUploads((cur) => cur?.filter((u) => u.id !== id) ?? null)
    } catch {
      toast.error("Could not delete that upload.")
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 dark:bg-gray-700 text-white hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {uploading ? "Uploading…" : "Upload CSV"}
        </button>
        <input ref={fileInput} type="file" accept=".csv" onChange={onPick} className="hidden" />
        <p className="text-xs text-gray-400 dark:text-gray-500">RWC / proline / MDA / chlorophyll, with timepoints — max 5 MB.</p>
      </div>

      {uploads && uploads.length > 0 && (
        <ul className="space-y-2">
          {uploads.map((u) => (
            <li key={u.id} className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{u.filename}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {u.row_count} rows · {u.columns.length} columns · {new Date(u.uploaded_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => onDelete(u.id)}
                  className="text-xs text-stress-600 hover:text-stress-500 shrink-0 cursor-pointer"
                >
                  Delete
                </button>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 truncate">
                Columns: {u.columns.join(", ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-gray-400 dark:text-gray-500">
        Stored and parsed for review only — not yet wired into model recalibration.
      </p>
    </div>
  )
}
