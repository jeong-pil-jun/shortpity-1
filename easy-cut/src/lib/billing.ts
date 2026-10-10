import { FunctionsHttpError } from '@supabase/supabase-js'
import type { User } from './auth'
import { supabase } from './supabase'

export interface Subscription {
  plan: User['plan']
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export interface PlanInfo {
  plan: Exclude<User['plan'], 'free'>
  name: string
  description: string | null
  interval: 'day' | 'week' | 'month' | 'year' | null
  intervalCount: number
  available: boolean
  prices: { amount: number; currency: string }[]
}

const MESSAGES: Record<string, string> = {
  unauthorized: 'You need to log in.',
  already_subscribed: 'You are already subscribed. You can change or cancel your plan in "Manage subscription".',
  no_customer: 'No billing history yet.',
  unknown_plan: 'This plan is not available for purchase right now.',
}

/** Calls the `billing` Edge Function; throws a Korean-language Error on failure */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('billing', { body })
  if (error) {
    let code = ''
    let polarStatus: number | undefined
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => ({}))) as { error?: string; polarStatus?: number }
      code = body.error ?? ''
      polarStatus = body.polarStatus
    }
    // Polar rejected our server's request: a configuration problem (token, product id), not the user's network
    if (code === 'polar_error') throw new Error(`Unable to proceed due to a billing configuration problem. (Polar ${polarStatus ?? 'error'})`)
    throw new Error(MESSAGES[code] ?? 'Could not connect to the billing server. Please try again later.')
  }
  return data as T
}

export const getPlans = () => call<{ plans: PlanInfo[] }>({ action: 'plans' }).then((r) => r.plans)

/** Sends the browser to Polar's hosted checkout */
export async function startCheckout(plan: PlanInfo['plan']) {
  const { url } = await call<{ url: string }>({ action: 'checkout', plan })
  window.location.assign(url)
}

/** Sends the browser to Polar's customer portal (cancel, change card, invoices) */
export async function openPortal() {
  const { url } = await call<{ url: string }>({ action: 'portal' })
  window.location.assign(url)
}

/** Asks the server to pull the latest state from Polar into the subscriptions table */
export const syncSubscription = () => call<{ subscription: Subscription }>({ action: 'sync' }).then((r) => r.subscription)

export async function getSubscription(): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end, cancel_at_period_end')
    .maybeSingle()
  return data
}

/** Formats an amount given in the currency's smallest unit (cents, or whole won for KRW) */
export function formatPrice(amount: number, currency: string) {
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
  return fmt.format(amount / 10 ** (fmt.resolvedOptions().maximumFractionDigits ?? 2))
}

export const INTERVAL_LABEL: Record<string, string> = { day: 'day', week: 'wk', month: 'mo', year: 'yr' }
