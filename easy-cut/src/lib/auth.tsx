import type { AuthError, User as SupabaseUser } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSubscription, type Subscription } from './billing'
import { supabase } from './supabase'

export interface User {
  id: string
  email: string
  name: string
  /** Derived from the server-owned subscriptions table, never from user-editable metadata */
  plan: 'free' | 'pro' | 'premium'
}

interface AuthContextValue {
  user: User | null
  /** True until the initial session has been restored from storage */
  loading: boolean
  signUp: (email: string, password: string, name: string) => Promise<{ needsConfirmation: boolean }>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  subscription: Subscription | null
  /** Re-reads the subscription row (e.g. after checkout) */
  refreshSubscription: () => Promise<Subscription | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Profile fields live in user_metadata (set at sign-up); the plan comes from the subscription row
function toUser(u: SupabaseUser | null | undefined, sub: Subscription | null): User | null {
  if (!u) return null
  const email = u.email ?? ''
  return {
    id: u.id,
    email,
    name: u.user_metadata?.name || email.split('@')[0],
    plan: sub?.plan ?? 'free',
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Your email has not been verified yet. Please check your inbox.',
  user_already_exists: 'This email is already registered.',
  email_exists: 'This email is already registered.',
  weak_password: 'Password is too weak. Please use at least 6 characters.',
  over_email_send_rate_limit: 'Email sending limit exceeded. Please try again later.',
  over_request_rate_limit: 'Too many requests. Please try again later.',
  signup_disabled: 'Sign-ups are currently disabled.',
}

/** Throws a Korean-language Error for a Supabase auth error */
function fail(error: AuthError): never {
  throw new Error((error.code && MESSAGES[error.code]) || error.message)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Keep the subscription row in step with whoever is signed in
    const loadSubscription = async (u: SupabaseUser | null) => setSubscription(u ? await getSubscription() : null)
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null
      setAuthUser(u)
      await loadSubscription(u)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      setAuthUser(u)
      // Deferred: supabase-js warns against awaiting other Supabase calls inside this callback
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(() => void loadSubscription(u))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const user = toUser(authUser, subscription)

  const value: AuthContextValue = {
    user,
    loading,
    subscription,
    async refreshSubscription() {
      const sub = await getSubscription()
      setSubscription(sub)
      return sub
    },
    async signUp(email, password, name) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name }, emailRedirectTo: `${window.location.origin}/projects` },
      })
      if (error) fail(error)
      // With "Confirm email" on, no session is returned until the link is clicked.
      // An empty identities list means the email is already registered (Supabase hides this to prevent enumeration).
      if (data.user && data.user.identities?.length === 0) throw new Error(MESSAGES.user_already_exists)
      return { needsConfirmation: !data.session }
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) fail(error)
    },
    async signOut() {
      const { error } = await supabase.auth.signOut()
      if (error) fail(error)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
