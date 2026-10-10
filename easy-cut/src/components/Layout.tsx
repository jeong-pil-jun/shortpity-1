import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export function Logo() {
  return (
    <Link to="/" className="logo">
      <span className="logo-mark">✂</span>
      <span>
        Short<b>Pity</b>
      </span>
    </Link>
  )
}

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  // The mobile menu is open only for the page it was opened on
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === location.pathname
  const setOpen = (fn: (o: boolean) => boolean) => setOpenOn(fn(open) ? location.pathname : null)
  const { user, loading, signOut } = useAuth()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  const logout = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="app">
      <header className="header">
        <div className="container header-inner">
          <Logo />
          <button className="menu-toggle" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            ☰
          </button>
          <nav className={`nav ${open ? 'open' : ''}`}>
            <NavLink to="/create">Create Shorts</NavLink>
            <NavLink to="/projects">My Projects</NavLink>
            <NavLink to="/templates">Templates</NavLink>
            <NavLink to="/guide">Guide</NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
            {loading ? null : user ? (
              <div className="nav-user">
                <span className="badge">{user.plan.toUpperCase()}</span>
                <span>{user.name}</span>
                <button className="btn btn-ghost btn-sm" onClick={logout}>
                  Log out
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn btn-primary btn-sm">
                Log in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <Logo />
            <p className="muted">Turn long videos into viral Shorts. Find highlights, add subtitles, and export — right in your browser.</p>
          </div>
          <div className="footer-links">
            <div>
              <h4>Product</h4>
              <Link to="/create">Create Shorts</Link>
              <Link to="/templates">Templates</Link>
              <Link to="/pricing">Pricing</Link>
            </div>
            <div>
              <h4>Support</h4>
              <Link to="/guide">Guide</Link>
              <Link to="/#faq">FAQ</Link>
            </div>
          </div>
        </div>
        <div className="container copyright muted">© {new Date().getFullYear()} ShortPity. All rights reserved.</div>
      </footer>
    </div>
  )
}
