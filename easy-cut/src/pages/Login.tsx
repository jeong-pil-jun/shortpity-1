import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Layout'
import { useAuth } from '../lib/auth'

type Mode = 'login' | 'signup'

export default function Login() {
  const { user, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const from = useLocation().state as { next?: string; nextState?: unknown } | null
  const next = from?.next ?? '/projects'
  const nextState = from?.nextState

  if (user) return <Navigate to={next} state={nextState} replace />

  const switchMode = (m: Mode) => {
    setMode(m)
    setError('')
    setNotice('')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Please enter a valid email.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')

    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        navigate(next, { state: nextState, replace: true })
      } else {
        const { needsConfirmation } = await signUp(email, password, name.trim() || email.split('@')[0])
        if (needsConfirmation) {
          setNotice(`We sent a verification email to ${email}. Click the link in the email to complete sign-up.`)
          setPassword('')
          setMode('login')
        } else {
          navigate(next, { state: nextState, replace: true })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container page auth">
      <form className="card auth-card" onSubmit={submit}>
        <Logo />
        <div className="toggle auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            Log in
          </button>
          <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>
            Sign up
          </button>
        </div>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
          />
        </label>
        {mode === 'signup' && (
          <label>
            Name (optional)
            <input autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nickname" />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <div className="notice">{notice}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Processing…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
      </form>
    </div>
  )
}
