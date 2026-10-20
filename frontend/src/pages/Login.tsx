import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ApiError } from "../api/client"
import { useAuth } from "../state/auth"

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate("/")
    } catch (err) {
      setError(err instanceof ApiError ? "Incorrect email or password." : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-leaf-50 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-leaf-700">PlantHealth</h1>
        <p className="text-sm text-gray-500">Log in to your account.</p>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Password</label>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </div>

        {error && <p className="text-sm text-stress-600">{error}</p>}

        <button
          type="submit" disabled={busy}
          className="w-full rounded-lg bg-leaf-600 text-white font-medium py-2.5 hover:bg-leaf-700 disabled:opacity-60"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>

        <p className="text-sm text-gray-500 text-center">
          No account? <Link to="/register" className="text-leaf-600 font-medium">Register</Link>
        </p>
        <p className="text-xs text-gray-400 text-center">
          Demo logins: basic@demo.planthealth / premium@demo.planthealth / pro@demo.planthealth —
          password <code>demo-password-123</code>
        </p>
      </form>
    </div>
  )
}
