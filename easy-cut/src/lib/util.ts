export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = String(m).padStart(h ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Parses "1:23", "01:02:03" or "83.5" into seconds. Returns NaN on bad input. */
export function parseTime(input: string): number {
  const parts = input.trim().split(':').map(Number)
  if (parts.some((p) => !Number.isFinite(p))) return NaN
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}

export function parseYouTubeId(url: string): string | null {
  const trimmed = url.trim()
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed
  try {
    const u = new URL(trimmed)
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12) || null
    if (u.hostname.endsWith('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return v
      const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{11})/)
      if (m) return m[2]
    }
  } catch {
    /* not a URL */
  }
  return null
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
