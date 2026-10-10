import type { Segment } from './types'
import { formatTime, uid } from './util'

const WINDOW_SEC = 0.5

export interface AnalysisResult {
  duration: number
  /** loudness per WINDOW_SEC, normalized 0..1 */
  energy: number[]
  windowSec: number
}

/**
 * Decodes the audio track of a video file and computes a loudness curve.
 * Runs entirely in the browser via the Web Audio API.
 */
export async function analyzeAudio(file: Blob, onProgress?: (p: number) => void): Promise<AnalysisResult> {
  onProgress?.(0.05)
  const buf = await file.arrayBuffer()
  onProgress?.(0.25)
  const ctx = new AudioContext()
  let audio: AudioBuffer
  try {
    audio = await ctx.decodeAudioData(buf)
  } finally {
    void ctx.close()
  }
  onProgress?.(0.7)

  const step = Math.max(1, Math.floor(audio.sampleRate * WINDOW_SEC))
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
  const n = Math.ceil(audio.length / step)
  const energy = new Array<number>(n)
  for (let w = 0; w < n; w++) {
    const from = w * step
    const to = Math.min(audio.length, from + step)
    let sum = 0
    for (const ch of channels) for (let i = from; i < to; i += 4) sum += ch[i] * ch[i]
    energy[w] = Math.sqrt(sum / (((to - from) / 4) * channels.length || 1))
  }
  onProgress?.(0.95)
  return { duration: audio.duration, energy: normalize(energy), windowSec: WINDOW_SEC }
}

function normalize(values: number[]): number[] {
  // Use the 98th percentile as max so a single spike doesn't flatten the curve
  const sorted = [...values].sort((a, b) => a - b)
  const max = sorted[Math.floor(sorted.length * 0.98)] || 1
  return values.map((v) => Math.min(1, v / max))
}

/**
 * Picks the most "exciting" non-overlapping windows: high average loudness
 * plus a bonus for dynamic range (sudden peaks like laughter, shouts, applause).
 */
export function findHighlights(
  analysis: AnalysisResult,
  opts: { count: number; length: number; baseTitle: string },
): Segment[] {
  const { energy, windowSec, duration } = analysis
  const len = Math.max(1, Math.round(Math.min(opts.length, duration) / windowSec))
  if (energy.length <= len) {
    return [makeSegment(0, duration, `${opts.baseTitle} highlight`, 1)]
  }

  const prefix = [0]
  const prefixSq = [0]
  for (const e of energy) {
    prefix.push(prefix[prefix.length - 1] + e)
    prefixSq.push(prefixSq[prefixSq.length - 1] + e * e)
  }
  const scores: { start: number; score: number }[] = []
  for (let s = 0; s + len <= energy.length; s++) {
    const mean = (prefix[s + len] - prefix[s]) / len
    const variance = (prefixSq[s + len] - prefixSq[s]) / len - mean * mean
    scores.push({ start: s, score: mean + 0.8 * Math.sqrt(Math.max(0, variance)) })
  }
  scores.sort((a, b) => b.score - a.score)

  const picked: { start: number; score: number }[] = []
  for (const c of scores) {
    if (picked.length >= opts.count) break
    if (picked.every((p) => Math.abs(p.start - c.start) >= len)) picked.push(c)
  }
  const top = picked[0]?.score || 1
  return picked.map((p, i) => {
    const start = p.start * windowSec
    const end = Math.min(duration, start + len * windowSec)
    return makeSegment(start, end, `${opts.baseTitle} #${i + 1} (${formatTime(start)})`, p.score / top)
  })
}

/** Fallback when a file has no decodable audio: evenly spaced clips. */
export function evenSegments(duration: number, count: number, length: number, baseTitle: string): Segment[] {
  const len = Math.min(length, duration)
  const n = Math.max(1, Math.min(count, Math.floor(duration / len)))
  const gap = (duration - len) / Math.max(1, n - 1)
  return Array.from({ length: n }, (_, i) => {
    const start = n === 1 ? 0 : i * gap
    return makeSegment(start, start + len, `${baseTitle} #${i + 1} (${formatTime(start)})`, 0)
  })
}

export function makeSegment(start: number, end: number, title: string, score: number): Segment {
  return { id: uid(), start, end, title, score, subtitles: [], comments: [] }
}

/** Downsample the curve for storage/timeline display. */
export function downsample(values: number[], target = 400): number[] {
  if (values.length <= target) return values.map((v) => +v.toFixed(3))
  const size = values.length / target
  return Array.from({ length: target }, (_, i) => {
    const chunk = values.slice(Math.floor(i * size), Math.floor((i + 1) * size))
    return +Math.max(...chunk).toFixed(3)
  })
}
