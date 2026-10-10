// POST /functions/v1/polar-webhook — Polar webhook receiver (deployed with verify_jwt = false)
import { Webhook } from 'npm:standardwebhooks@1'
import { admin, syncCustomer } from '../_shared/polar.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Payload {
  type: string
  data: { external_id?: string | null; customer?: { external_id?: string | null } | null }
}

/** Secrets created on/after 2026-09-08 are Standard Webhooks; older ones are Polar HMAC (base64 of the whole string) */
function verify(body: string, headers: Record<string, string>): Payload {
  const secret = (Deno.env.get('POLAR_WEBHOOK_SECRET') ?? '').trim()
  try {
    return new Webhook(secret).verify(body, headers) as Payload
  } catch {
    return new Webhook(btoa(secret)).verify(body, headers) as Payload
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const body = await req.text()
  const headers = Object.fromEntries(req.headers)
  let payload: Payload
  try {
    payload = verify(body, headers)
  } catch {
    console.warn('[polar-webhook] invalid signature')
    return new Response('invalid signature', { status: 403 })
  }

  const webhookId = headers['webhook-id']
  const db = admin()

  // Idempotency: one receipt per delivery id; skip ones already processed
  const { data: receipt } = await db.from('polar_webhook_events').select('processed_at, attempts').eq('webhook_id', webhookId).maybeSingle()
  if (receipt?.processed_at) return new Response(null, { status: 202 })
  await db.from('polar_webhook_events').upsert({
    webhook_id: webhookId,
    type: payload.type,
    attempts: (receipt?.attempts ?? 0) + 1,
    last_error: null,
  })

  try {
    // customer.state_changed carries the customer itself; subscription.* / order.* embed it
    const externalId = payload.data.external_id ?? payload.data.customer?.external_id
    const relevant = payload.type === 'customer.state_changed' || payload.type.startsWith('subscription.') || payload.type.startsWith('order.')

    // Rather than trusting event order, re-read the full customer state from Polar
    if (relevant && externalId && UUID.test(externalId)) await syncCustomer(externalId)

    await db.from('polar_webhook_events').update({ processed_at: new Date().toISOString() }).eq('webhook_id', webhookId)
    return new Response(null, { status: 202 })
  } catch (e) {
    console.error('[polar-webhook]', payload.type, e)
    await db.from('polar_webhook_events').update({ last_error: String(e).slice(0, 500) }).eq('webhook_id', webhookId)
    // Non-2xx makes Polar retry with backoff
    return new Response('processing failed', { status: 500 })
  }
})
