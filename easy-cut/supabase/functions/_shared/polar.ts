// Shared helpers for the Polar billing Edge Functions (Deno runtime).
import { createClient, type User } from 'npm:@supabase/supabase-js@2'

const env = (name: string, fallback?: string) => {
  const v = Deno.env.get(name) ?? fallback
  if (v === undefined) throw new Error(`Missing env ${name}`)
  return v
}

/** "sandbox" (default) or "production" */
const POLAR_SERVER = env('POLAR_SERVER', 'sandbox')
const POLAR_API = POLAR_SERVER === 'production' ? 'https://api.polar.sh/v1' : 'https://sandbox-api.polar.sh/v1'
export const APP_URL = env('APP_URL', 'http://localhost:5173').replace(/\/$/, '')

export type Plan = 'free' | 'pro' | 'premium'

/** Polar product id → our plan. Premium is optional until its product exists. */
export function productPlans(): Record<string, Exclude<Plan, 'free'>> {
  const map: Record<string, Exclude<Plan, 'free'>> = { [env('POLAR_PRO_PRODUCT_ID')]: 'pro' }
  const premium = Deno.env.get('POLAR_PREMIUM_PRODUCT_ID')
  if (premium) map[premium] = 'premium'
  return map
}

export class PolarError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Polar API ${status}: ${body.slice(0, 300)}`)
  }
}

/** Calls the Polar Core API with the organization access token, pinned to API version 2026-10. */
export async function polar<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${POLAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env('POLAR_ACCESS_TOKEN').trim()}`,
      'Polar-Version': '2026-10',
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const text = await res.text()
  if (!res.ok) throw new PolarError(res.status, text)
  return (text ? JSON.parse(text) : null) as T
}

// ---------- Supabase ----------

/** Service-role client: bypasses RLS, server-side only */
export const admin = () =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

/** Resolves the signed-in Supabase user from the request's Authorization header */
export async function requireUser(req: Request): Promise<User | null> {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return null
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data } = await client.auth.getUser()
  return data.user
}

// ---------- Customer state → subscriptions row ----------

interface CustomerStateSubscription {
  id: string
  status: string
  product_id: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}
interface CustomerState {
  id: string
  external_id: string | null
  active_subscriptions: CustomerStateSubscription[]
}

const RANK: Record<Plan, number> = { free: 0, pro: 1, premium: 2 }
const GRANTING = new Set(['active', 'trialing'])

/**
 * Reconciles one user's billing state from Polar's Customer State API (the source of truth)
 * into public.subscriptions. Safe to call any number of times, in any order.
 */
export async function syncCustomer(userId: string) {
  let state: CustomerState | null = null
  try {
    state = await polar<CustomerState>(`/customers/external/${encodeURIComponent(userId)}/state`)
  } catch (e) {
    if (!(e instanceof PolarError && e.status === 404)) throw e
  }

  const plans = productPlans()
  const best = (state?.active_subscriptions ?? [])
    .filter((s) => plans[s.product_id] && GRANTING.has(s.status))
    .sort((a, b) => RANK[plans[b.product_id]] - RANK[plans[a.product_id]])[0]

  const row = {
    user_id: userId,
    plan: best ? plans[best.product_id] : ('free' as Plan),
    status: best?.status ?? 'none',
    polar_customer_id: state?.id ?? null,
    polar_subscription_id: best?.id ?? null,
    product_id: best?.product_id ?? null,
    current_period_end: best?.current_period_end ?? null,
    cancel_at_period_end: best?.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin().from('subscriptions').upsert(row)
  if (error) throw new Error(`subscriptions upsert failed: ${error.message}`)
  return row
}

// ---------- HTTP ----------

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
