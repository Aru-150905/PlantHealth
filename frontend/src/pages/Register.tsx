import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../state/auth"
import type { Tier } from "../api/client"

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [tenantName, setTenantName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [tier, setTier] = useState<Tier>("basic")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await register(tenantName, email, password, tier)
      navigate("/") // -> role choice, since a new account's role is "unset"
    } catch {
      setError("Could not create your account. Is that email already registered?")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-leaf-50 dark:bg-gray-900 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl surface p-8 space-y-4 animate-fade-in">
        <h1 className="font-display text-2xl font-semibold text-leaf-700 dark:text-leaf-500">Create your account</h1>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Farm or lab name</label>
          <input
            required value={tenantName} onChange={(e) => setTenantName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
          <input
            type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan (billing is stubbed — change anytime)</label>
          <select
            value={tier} onChange={(e) => setTier(e.target.value as Tier)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          >
            <option value="basic">Basic</option>
            <option value="premium">Premium</option>
            <option value="pro">Pro</option>
          </select>
        </div>

        {error && <p className="text-sm text-stress-600">{error}</p>}

        <button
          type="submit" disabled={busy}
          className="w-full rounded-lg bg-leaf-600 text-white font-medium py-2.5 hover:bg-leaf-700 disabled:opacity-60 transition-colors cursor-pointer"
        >
          {busy ? "Creating…" : "Create account"}
        </button>

        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Already have an account? <Link to="/login" className="text-leaf-600 dark:text-leaf-500 font-medium">Log in</Link>
        </p>
      </form>
    </div>
  )
}
