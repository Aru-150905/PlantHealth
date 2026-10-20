/**
 * Thin fetch wrapper around the FastAPI backend (backend/api/). All requests go through
 * /api, proxied to the backend by Vite in dev (see vite.config.ts) — same pattern a real
 * deployment's reverse proxy would use, so no separate "prod base URL" branch is needed.
 */

const BASE = "/api"

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail))
    this.status = status
    this.detail = detail
  }
}

let authToken: string | null = null
export function setAuthToken(token: string | null) {
  authToken = token
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) }
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`
  if (init?.body && !(init.body instanceof URLSearchParams)) headers["Content-Type"] = "application/json"

  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail: unknown
    try {
      detail = (await res.json()).detail
    } catch {
      detail = res.statusText
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** URLSearchParams (used only by login(), which needs OAuth2PasswordRequestForm's
 * application/x-www-form-urlencoded body) must pass through untouched — JSON.stringify-ing
 * it here would silently serialize to "{}" (URLSearchParams has no enumerable own
 * properties) and the server would see an empty body, not the form fields. */
function encodeBody(body: unknown): BodyInit | undefined {
  if (body === undefined) return undefined
  if (body instanceof URLSearchParams) return body
  return JSON.stringify(body)
}

const get = <T,>(path: string) => request<T>(path)
const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: encodeBody(body) })
const put = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: "PUT", body: encodeBody(body) })
const del = (path: string) => request<void>(path, { method: "DELETE" })

// --- types mirroring backend/api/schemas.py ---

export type Tier = "basic" | "premium" | "pro"
export type Role = "farmer" | "lab" | "both" | "unset"

export interface Tenant {
  id: string
  name: string
  tier: Tier
  role: Role
  suspended: boolean
  onboarding_completed: boolean
  language: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  tenant: Tenant
}

export interface FieldLayout {
  kind: "rows" | "grid" | "rough"
  rows?: number | null
  spacing_m?: number | null
  grid_width?: number | null
  grid_height?: number | null
}

export interface FarmerProfile {
  crop: string
  plant_count?: number | null
  plant_count_band?: string | null
  sensor_count: number
  field_layout: FieldLayout
  watering_method: string
  salinity_history: string
  region?: string | null
  season?: string | null
  alert_threshold: string
  language: string
}

export interface LabProfile {
  species: string
  species_other?: string | null
  n_plants?: number | null
  n_treatment_arms?: number | null
  stresses: string[]
  replicates_per_arm?: number | null
  chamber_type: string
  light_hours_on: number
  light_hours_off: number
  light_switch_time?: string | null
  sampling_rate_hz: number
  electrode_config?: string | null
  n_channels?: number | null
  amplifier_gain?: number | null
  has_ground_truth_assay: boolean
  show_random_split_comparison: boolean
  export_retention_preference?: string | null
}

export interface OnboardingOut {
  role: Role
  onboarding_completed: boolean
  farmer: FarmerProfile | null
  lab: LabProfile | null
  coverage_ratio_text: string | null
  confound_panel_enabled: boolean | null
}

export interface PlantOut {
  id: string
  label: string | null
  device_id: string | null
  covered_count: number
  row: number | null
  col: number | null
}

export interface DeviceOut {
  id: string
  serial: string
  last_seen_at: string | null
  battery_pct: number | null
  signal_quality: number | null
  electrode_drift_flagged: boolean
  artefact_flagged: boolean
}

export interface PredictionResult {
  stressed: boolean | null
  class_label: string | null
  confidence_band: string | null
  confidence_pct: number | null
  full_probability_vector?: Record<string, number>
  unknown: boolean
  unknown_reason?: string
  diagnosis_remedy_available: boolean
  severity_timeline_available: boolean
  shap_available: boolean
  raw_export: string
}

export interface FieldCell {
  ring: number
  is_measured: boolean
  is_unknown: boolean
  cell_count: number
  result: PredictionResult
}

export interface FieldOut {
  plant_id: string
  block_size: number
  is_synthetic: boolean
  cells: FieldCell[]
}

export interface TrendPoint {
  timestamp: string
  days_ago: number
  result: PredictionResult
}

export interface TrendOut {
  plant_id: string
  window_days: number
  is_synthetic: boolean
  points: TrendPoint[]
}

export interface TierLimits {
  max_sentinel_devices: number | null
  max_plants_covered: number | null
  which_of_4_states: boolean
  confidence_detail: string
  diagnosis_and_remedy: boolean
  diagnosis_severity_timeline: boolean
  history_retention_days: number | null
  raw_export: string
  shap_explanations: boolean
  alerts: string
}

export const api = {
  register: (body: { tenant_name: string; email: string; password: string; tier: Tier }) =>
    post<TokenResponse>("/auth/register", body),
  login: (email: string, password: string) => {
    const form = new URLSearchParams({ username: email, password })
    return post<TokenResponse>("/auth/login", form)
  },
  me: () => get<{ id: string; email: string; is_admin: boolean; tenant: Tenant }>("/auth/me"),

  myTenant: () => get<Tenant>("/tenants/me"),
  myTierLimits: () => get<{ tier: Tier; limits: TierLimits }>("/tenants/me/tier-limits"),
  setRole: (role: Role) => put<Tenant>("/tenants/me/role", { role }),
  setLanguage: (language: string) => put<Tenant>("/tenants/me/language", { language }),
  getOnboarding: () => get<OnboardingOut>("/tenants/me/onboarding"),
  submitFarmerOnboarding: (body: Partial<FarmerProfile>) =>
    put<OnboardingOut>("/tenants/me/onboarding/farmer", body),
  submitLabOnboarding: (body: Partial<LabProfile>) =>
    put<OnboardingOut>("/tenants/me/onboarding/lab", body),

  listPlants: () => get<PlantOut[]>("/plants"),
  createPlant: (body: { label?: string; device_id?: string | null; covered_count?: number }) =>
    post<PlantOut>("/plants", body),
  listDevices: () => get<DeviceOut[]>("/devices"),
  createDevice: (serial: string) => post<DeviceOut>("/devices", { serial }),
  predict: (plantId: string) => post<{ result: PredictionResult; plant_id: string; is_synthetic: boolean }>(`/plants/${plantId}/predict`, {}),
  field: (plantId: string, blockSize?: number) =>
    get<FieldOut>(`/plants/${plantId}/field${blockSize ? `?block_size=${blockSize}` : ""}`),
  trend: (plantId: string, days: 1 | 7) => get<TrendOut>(`/plants/${plantId}/trend?days=${days}`),

  del,
}
