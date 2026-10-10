import type { MouseEvent } from 'react'
import type { Segment } from '../lib/types'
import { formatTime } from '../lib/util'

interface Props {
  duration: number
  energy: number[]
  segments: Segment[]
  selectedId?: string
  time: number
  onSeek: (t: number, segmentId?: string) => void
}

/** Whole-video overview: loudness curve, clip ranges and playhead. */
export default function Timeline({ duration, energy, segments, selectedId, time, onSeek }: Props) {
  if (!duration) return null
  const x = (t: number) => (t / duration) * 1000

  const click = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const t = ((e.clientX - r.left) / r.width) * duration
    const hit = segments.find((s) => t >= s.start && t <= s.end)
    onSeek(t, hit?.id)
  }

  const ticks = Array.from({ length: 6 }, (_, i) => (duration * i) / 5)
  const bw = energy.length ? 1000 / energy.length : 0

  return (
    <div className="timeline">
      <svg viewBox="0 0 1000 80" preserveAspectRatio="none" onClick={click}>
        {segments.map((s) => (
          <rect
            key={s.id}
            x={x(s.start)}
            y={0}
            width={Math.max(2, x(s.end) - x(s.start))}
            height={80}
            className={s.id === selectedId ? 'seg selected' : 'seg'}
          />
        ))}
        {energy.map((e, i) => (
          <rect key={i} x={i * bw} y={80 - e * 70} width={Math.max(0.6, bw * 0.7)} height={e * 70} className="bar" />
        ))}
        <line x1={x(time)} x2={x(time)} y1={0} y2={80} className="playhead" />
      </svg>
      <div className="ticks">
        {ticks.map((t) => (
          <span key={t}>{formatTime(t)}</span>
        ))}
      </div>
    </div>
  )
}
