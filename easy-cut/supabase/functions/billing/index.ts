// POST /functions/v1/billing  { action: 'plans' | 'checkout' | 'portal' | 'sync', plan? }
import { admin, APP_URL, cors, json, polar, PolarError, productPlans, requireUser, syncCustomer, type Plan } from '../_shared/polar.ts'

interface Product {
  id: string
  name: string
  description: string | null
  recurring_interval: string | null
  recurring_interval_count: number | null
  is_archived: boolean
  prices: { amount_type: string; price_amount?: number; price_currency?: string; is_archived: boolean }[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { action, plan } = (await req.json().catch(() => ({}))) as { action?: string; plan?: Plan }

    // Public: live prices straight from Polar so the pricing page never disagrees with checkout
    if (action === 'plans') {
      const entries = Object.entries(productPlans())
      const plans = await Promise.all(
        entries.map(async ([productId, planId]) => {
          const p = await polar<Product>(`/products/${productId}`)
          return {
            plan: planId,
            name: p.name,
            description: p.description,
            interval: p.recurring_interval,
            intervalCount: p.recurring_interval_count ?? 1,
            available: !p.is_archived,
            prices: p.prices
              .filter((pr) => !pr.is_archived && pr.amount_type === 'fixed')
              .map((pr) => ({ amount: pr.price_amount!, currency: pr.price_currency! })),
          }
        }),
      )
      return json({ plans })
    }

    const user = await requireUser(req)
    if (!user) return json({ error: 'unauthorized' }, 401)

    if (action === 'checkout') {
      const productId = Object.entries(productPlans()).find(([, p]) => p === plan)?.[0]
      if (!productId) return json({ error: 'unknown_plan' }, 400)

      // Don't let a user stack a second subscription; upgrades/cancellation go through the portal
      const { data: current } = await admin().from('subscriptions').select('plan').eq('user_id', user.id).maybeSingle()
      if (current && current.plan !== 'free') return json({ error: 'already_subscribed' }, 409)

      const checkout = await polar<{ url: string }>('/checkouts/', {
        method: 'POST',
        body: JSON.stringify({
          products: [productId],
          // Our Supabase user id is the durable link between the two systems
          external_customer_id: user.id,
          customer_email: user.email,
          customer_name: user.user_metadata?.name ?? null,
          customer_ip_address: req.headers.get('x-forwarded-for')?.split(',')[0].trim() || null,
          metadata: { supabase_user_id: user.id, plan },
          success_url: `${APP_URL}/billing/success?checkout_id={CHECKOUT_ID}`,
          return_url: `${APP_URL}/pricing`,
        }),
      })
      return json({ url: checkout.url })
    }

    if (action === 'portal') {
      try {
        const session = await polar<{ customer_portal_url: string }>('/customer-sessions/', {
          method: 'POST',
          body: JSON.stringify({ external_customer_id: user.id, return_url: `${APP_URL}/pricing` }),
        })
        return json({ url: session.customer_portal_url })
      } catch (e) {
        if (e instanceof PolarError && (e.status === 404 || e.status === 422)) return json({ error: 'no_customer' }, 404)
        throw e
      }
    }

    // Pull the latest state from Polar right away (used after checkout, before the webhook lands)
    if (action === 'sync') return json({ subscription: await syncCustomer(user.id) })

    return json({ error: 'unknown_action' }, 400)
  } catch (e) {
    console.error('[billing]', e)
    // Surface Polar's status (not its body) so misconfiguration is diagnosable from the client
    if (e instanceof PolarError) return json({ error: 'polar_error', polarStatus: e.status }, 502)
    return json({ error: 'internal_error', message: e instanceof Error ? e.message.slice(0, 120) : undefined }, 500)
  }
})
