import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type User } from '../lib/auth'
import { formatPrice, getPlans, INTERVAL_LABEL, openPortal, startCheckout, type PlanInfo } from '../lib/billing'

const PLANS: { id: User['plan']; name: string; features: string[]; highlight?: boolean }[] = [
  { id: 'free', name: 'Free', features: ['10 Shorts per month', '720p export', '5 basic templates', 'Subtitle · text card overlays'] },
  { id: 'pro', name: 'Pro', features: ['100 Shorts per month', '1080p export', 'No watermark', 'Batch export', 'Priority processing'], highlight: true },
  { id: 'premium', name: 'Premium', features: ['Unlimited Shorts', '5 team members', 'Brand templates', 'Auto-upload to linked channels', 'Dedicated support'] },
]

const SANDBOX = import.meta.env.VITE_BILLING_SANDBOX === 'true'

function priceLabel(info: PlanInfo) {
  // A product can carry several currencies; Polar picks one by the buyer's country, so prefer KRW here
  const price = info.prices.find((p) => p.currency === 'krw') ?? info.prices[0]
  if (!price) return null
  const unit = info.interval ? `${info.intervalCount > 1 ? info.intervalCount : ''}${INTERVAL_LABEL[info.interval]}` : ''
  return { amount: formatPrice(price.amount, price.currency), unit }
}

export default function Pricing() {
  const { user, subscription } = useAuth()
  const navigate = useNavigate()
  const [plans, setPlans] = useState<PlanInfo[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const current = user?.plan
  const subscribed = !!current && current !== 'free'

  useEffect(() => {
    getPlans().then(setPlans, (e) => {
      setPlans([])
      setError(e instanceof Error ? e.message : String(e))
    })
  }, [])

  const run = async (key: string, fn: () => Promise<void>) => {
    setError('')
    setBusy(key)
    try {
      await fn() // on success the browser navigates to Polar
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  const subscribe = (plan: PlanInfo['plan']) => {
    if (!user) return navigate('/login', { state: { next: '/pricing' } })
    void run(plan, () => startCheckout(plan))
  }
  const manage = () => void run('portal', openPortal)

  return (
    <div className="container page">
      <div className="center">
        <h1>Pricing</h1>
        <p className="muted">Choose only what you need. Change or cancel anytime.</p>
      </div>

      {SANDBOX && (
        <div className="notice">
          🧪 This is a test (sandbox) payment environment. You will not actually be charged. You can test payments with card number <b>4242 4242 4242 4242</b>,
          any future expiry date, and any CVC.
        </div>
      )}
      {subscribed && subscription && (
        <div className="notice billing-status">
          <span>
            You are currently subscribed to the <b>{current!.toUpperCase()}</b> plan.
            {subscription.current_period_end &&
              (subscription.cancel_at_period_end
                ? ` It will be canceled on ${new Date(subscription.current_period_end).toLocaleDateString('en-US')}.`
                : ` Next billing date: ${new Date(subscription.current_period_end).toLocaleDateString('en-US')}`)}
            {subscription.status === 'past_due' && ' Your payment failed. Please check your payment method.'}
          </span>
          <button className="btn btn-outline btn-sm" onClick={manage} disabled={busy !== null}>
            {busy === 'portal' ? 'Redirecting…' : 'Manage subscription'}
          </button>
        </div>
      )}
      {error && <p className="error center">{error}</p>}

      <div className="grid-3 pricing">
        {PLANS.map((p) => {
          const info = plans?.find((x) => x.plan === p.id)
          const price = info && priceLabel(info)
          const purchasable = !!info?.available && !!price
          return (
            <div className={`card plan ${p.highlight ? 'highlight' : ''}`} key={p.id}>
              {p.highlight && <span className="pill">Most popular</span>}
              <h3>{p.name}</h3>
              <div className="price">
                {p.id === 'free' ? 'Free' : price ? price.amount : plans === null ? '…' : 'Coming soon'}
                {price?.unit && <small>/{price.unit}</small>}
              </div>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              {p.id === 'free' ? (
                <button className="btn btn-outline" disabled={current === 'free'} onClick={() => (user ? manage() : navigate('/login'))}>
                  {current === 'free' ? 'Current plan' : user ? 'Cancel in Manage subscription' : 'Start for free'}
                </button>
              ) : current === p.id ? (
                <button className="btn btn-outline" onClick={manage} disabled={busy !== null}>
                  Current plan · Manage
                </button>
              ) : (
                <button
                  className={`btn ${p.highlight ? 'btn-primary' : 'btn-outline'}`}
                  disabled={!purchasable || busy !== null}
                  onClick={() => (subscribed ? manage() : subscribe(p.id as PlanInfo['plan']))}
                >
                  {busy === p.id ? 'Redirecting to checkout…' : !purchasable ? 'Coming soon' : subscribed ? 'Change in Manage subscription' : 'Subscribe'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted small center">
        Payments are processed securely by Polar, our Merchant of Record. You can see the final amount (including tax) on the checkout page.
      </p>
    </div>
  )
}
