import type { ReactNode } from "react"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import AdminDashboard from "./pages/AdminDashboard"
import FarmerHome from "./pages/FarmerHome"
import GuidePicker from "./pages/GuidePicker"
import LabHome from "./pages/LabHome"
import Login from "./pages/Login"
import FarmerOnboarding from "./pages/onboarding/FarmerOnboarding"
import LabOnboarding from "./pages/onboarding/LabOnboarding"
import Register from "./pages/Register"
import Welcome from "./pages/Welcome"
import RoleChoice from "./pages/RoleChoice"
import Settings from "./pages/Settings"
import { nextOnboardingPath } from "./state/onboardingRouting"
import { useAuth } from "./state/auth"
import { useT } from "./i18n"

/** Routes the user to wherever their account's state actually says they should be —
 * unset role -> the first-run question, incomplete onboarding -> the right wizard (for a
 * "both" role account, whichever of farmer/lab is actually still missing — see
 * state/onboardingRouting.ts), otherwise the role-appropriate home. One place this logic
 * lives, not scattered per-page checks. */
function Gate({ children }: { children: ReactNode }) {
  const { token, tenant, onboarding, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading />
  if (!token || !tenant) return <Navigate to="/welcome" replace />
  if (tenant.role === "unset") return <Navigate to="/role" replace />

  // growers pick their helper once before anything else (accounts made before the helper
  // existed get asked too, then land back where they were going)
  if ((tenant.role === "farmer" || tenant.role === "both") && !tenant.guide_character) {
    return <Navigate to={`/guide?next=${encodeURIComponent(location.pathname)}`} replace />
  }
  const pending = nextOnboardingPath(tenant.role, onboarding)
  if (pending) return <Navigate to={pending} replace />
  return <>{children}</>
}

function HomeRedirect() {
  const { tenant } = useAuth()
  if (!tenant) return null
  if (tenant.role === "unset") return <Navigate to="/role" replace />
  // a "both" account's default landing — switch between /farmer and /lab anytime via Settings
  return <Navigate to={tenant.role === "lab" ? "/lab" : "/farmer"} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/role" element={<RequireAccount><RoleChoice /></RequireAccount>} />
      <Route path="/guide" element={<RequireAccount><GuidePicker /></RequireAccount>} />
      <Route path="/onboarding/farmer" element={<RequireAccount><FarmerOnboarding /></RequireAccount>} />
      <Route path="/onboarding/lab" element={<RequireAccount><LabOnboarding /></RequireAccount>} />
      <Route path="/farmer" element={<Gate><FarmerHome /></Gate>} />
      <Route path="/lab" element={<Gate><LabHome /></Gate>} />
      <Route path="/settings" element={<RequireAccount><Settings /></RequireAccount>} />
      {/* admin-ness is enforced server-side (require_admin) — a non-admin here just sees
          AdminDashboard's own graceful "you don't have access" state, not a client-side gate */}
      <Route path="/admin" element={<RequireAccount><AdminDashboard /></RequireAccount>} />
      <Route path="/" element={<Gate><HomeRedirect /></Gate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Looser than Gate: requires login but not a completed onboarding — the onboarding and
 * settings pages themselves need to be reachable precisely when onboarding isn't done. */
function RequireAccount({ children }: { children: ReactNode }) {
  const { token, tenant, loading } = useAuth()
  if (loading) return <Loading />
  if (!token || !tenant) return <Navigate to="/welcome" replace />
  return <>{children}</>
}

function Loading() {
  const { t } = useT()
  return <div className="min-h-dvh flex items-center justify-center bg-leaf-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500">{t("common.loading")}</div>
}
