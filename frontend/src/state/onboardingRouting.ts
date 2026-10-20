import type { OnboardingOut, Role } from "../api/client"

/**
 * Which onboarding wizard (if any) the account still needs, given its role and what
 * onboarding has actually captured so far.
 *
 * For role="both" this must check BOTH profiles, not just assume "farmer" — an account
 * that completed the farmer flow and then switched to "both" needs the LAB wizard next,
 * not to redo the farmer one. Centralized here (rather than duplicated in App.tsx's route
 * guard and Settings.tsx's role switch) specifically because that duplication is what
 * caused this bug in the first place during manual testing.
 */
export function nextOnboardingPath(role: Role, onboarding: OnboardingOut | null): string | null {
  const hasFarmer = !!onboarding?.farmer
  const hasLab = !!onboarding?.lab

  if (role === "farmer") return hasFarmer ? null : "/onboarding/farmer"
  if (role === "lab") return hasLab ? null : "/onboarding/lab"
  if (role === "both") {
    if (!hasFarmer) return "/onboarding/farmer"
    if (!hasLab) return "/onboarding/lab"
    return null
  }
  return null // role === "unset" — handled separately by the role-choice screen
}
