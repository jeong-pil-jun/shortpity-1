import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { syncSubscription } from '../lib/billing'

type Status = 'checking' | 'done' | 'pending' | 'error'

/** Polar redirects here after checkout. Activation is confirmed server-side, never from the URL. */
export default function BillingSuccess() {
  const { refreshSubscription } = useAuth()
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Payment confirmation can lag a few seconds behind the redirect
      for (let i = 0; i < 6 && !cancelled; i++) {
        try {
          const sub = await syncSubscription()
          if (sub.plan !== 'free') {
            await refreshSubscription()
            if (!cancelled) setStatus('done')
            return
          }
        } catch {
          if (!cancelled) setStatus('error')
          return
        }
        await new Promise((r) => setTimeout(r, 2000))
      }
      if (!cancelled) setStatus('pending')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="container page auth">
      <div className="card auth-card center">
        {status === 'checking' && (
          <>
            <div className="spinner" style={{ margin: '0 auto' }} />
            <h2>Confirming your payment…</h2>
          </>
        )}
        {status === 'done' && (
          <>
            <h2>🎉 Your subscription has started</h2>
            <p className="muted">You can now use paid plan features.</p>
            <Link to="/create" className="btn btn-primary">
              Start creating Shorts
            </Link>
          </>
        )}
        {status === 'pending' && (
          <>
            <h2>Payment confirmation is delayed</h2>
            <p className="muted">If your payment went through, it will be reflected automatically shortly. Please check the Pricing page in a few minutes.</p>
            <Link to="/pricing" className="btn btn-outline">
              Go to Pricing
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h2>We could not verify your payment status</h2>
            <p className="muted">Your payment may have been processed successfully. Please check the Pricing page again shortly.</p>
            <Link to="/pricing" className="btn btn-outline">
              Go to Pricing
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
