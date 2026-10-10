import type { Segment, Template } from './types'

/** Logical canvas size (9:16). Everything is laid out in these units, then scaled. */
export const W = 1080
export const H = 1920
const FONT = `'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif`

interface Token {
  word: string
  emphasis: boolean
}

function tokenize(text: string): Token[] {
  return text.split('*').flatMap((part, i) =>
    part
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => ({ word, emphasis: i % 2 === 1 })),
  )
}

function wrap(ctx: CanvasRenderingContext2D, tokens: Token[], maxWidth: number): Token[][] {
  const space = ctx.measureText(' ').width
  const lines: Token[][] = [[]]
  let width = 0
  for (const t of tokens) {
    const w = ctx.measureText(t.word).width
    if (width > 0 && width + space + w > maxWidth) {
      lines.push([])
      width = 0
    }
    lines[lines.length - 1].push(t)
    width += (width > 0 ? space : 0) + w
  }
  return lines.filter((l) => l.length)
}

function drawRichText(
  ctx: CanvasRenderingContext2D,
  text: string,
  opts: { x: number; y: number; maxWidth: number; size: number; color: string; emphasis: string; stroke?: string; lineGap?: number },
): number {
  ctx.font = `800 ${opts.size}px ${FONT}`
  ctx.textBaseline = 'top'
  const lines = wrap(ctx, tokenize(text), opts.maxWidth)
  const lineH = opts.size * (opts.lineGap ?? 1.25)
  const space = ctx.measureText(' ').width
  lines.forEach((line, li) => {
    const total = line.reduce((s, t) => s + ctx.measureText(t.word).width, 0) + space * (line.length - 1)
    let x = opts.x - total / 2
    const y = opts.y + li * lineH
    for (const t of line) {
      if (opts.stroke && opts.stroke !== 'transparent') {
        ctx.lineWidth = opts.size * 0.16
        ctx.lineJoin = 'round'
        ctx.strokeStyle = opts.stroke
        ctx.strokeText(t.word, x, y)
      }
      ctx.fillStyle = t.emphasis ? opts.emphasis : opts.color
      ctx.fillText(t.word, x, y)
      x += ctx.measureText(t.word).width + space
    }
  })
  return lines.length * lineH
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Where the source video sits in the 1080x1920 frame. `bottom` anchors the subtitles. */
export function videoRect(tpl: Template, aspect: number) {
  if (tpl.layout === 'crop') {
    const w = H * aspect
    return { x: (W - w) / 2, y: 0, w, h: H, bottom: H * 0.7 }
  }
  const h = Math.min(W / aspect, H * 0.6)
  const w = h * aspect
  const y = (H - h) / 2
  return { x: (W - w) / 2, y, w, h, bottom: y + h }
}

/**
 * Draws one frame of the short. `t` is seconds relative to the segment start.
 * Used both for the live preview and the exported video so they always match.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  segment: Segment,
  tpl: Template,
  t: number,
  fallbackAspect = 16 / 9,
) {
  const scale = ctx.canvas.width / W
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = tpl.background
  ctx.fillRect(0, 0, W, H)

  // --- video ---
  const aspect = video?.videoWidth ? video.videoWidth / video.videoHeight : fallbackAspect
  const rect = videoRect(tpl, aspect)
  if (video?.videoWidth) ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h)
  const videoBottom = rect.bottom

  const fs = tpl.fontScale

  // --- title ---
  if (segment.title) {
    const size = 70 * fs
    ctx.font = `800 ${size}px ${FONT}`
    const lines = wrap(ctx, tokenize(segment.title), W - 160).length
    const boxH = lines * size * 1.25 + 50
    const top = 180
    if (tpl.titleBackground !== 'transparent') {
      ctx.fillStyle = tpl.titleBackground
      roundRect(ctx, 60, top - 25, W - 120, boxH, 28)
      ctx.fill()
    }
    drawRichText(ctx, segment.title, {
      x: W / 2,
      y: top,
      maxWidth: W - 160,
      size,
      color: tpl.titleColor,
      emphasis: tpl.emphasisColor,
      stroke: tpl.titleBackground === 'transparent' ? 'rgba(0,0,0,0.5)' : undefined,
    })
  }

  // --- subtitle ---
  const sub = segment.subtitles.find((s) => t >= s.start && t < s.end)
  const subTop = tpl.layout === 'crop' ? H * 0.7 : videoBottom + 40
  let subHeight = 0
  if (sub) {
    subHeight = drawRichText(ctx, sub.text, {
      x: W / 2,
      y: subTop,
      maxWidth: W - 120,
      size: 62 * fs,
      color: tpl.subtitleColor,
      emphasis: tpl.emphasisColor,
      stroke: tpl.subtitleStroke,
    })
  }

  // --- text card overlays: appear one by one over the clip ---
  const cards = segment.comments.filter((c) => c.text.trim())
  if (tpl.showComments && cards.length) {
    const dur = segment.end - segment.start
    const visible = cards.filter((_, i) => t >= ((i + 1) * dur) / (cards.length + 2))
    let y = Math.max(subTop + subHeight + 30, videoBottom + 170)
    for (const c of visible.slice(-2)) {
      if (y > H - 170) break
      ctx.font = `700 40px ${FONT}`
      const textLines = wrap(ctx, tokenize(c.text), W - 260)
      const label = c.author.trim()
      const top = label ? 66 : 26
      const h = top + 14 + textLines.length * 50
      ctx.fillStyle = 'rgba(255,255,255,0.94)'
      roundRect(ctx, 80, y, W - 160, h, 30)
      ctx.fill()
      ctx.textBaseline = 'top'
      if (label) {
        ctx.fillStyle = '#7a7a85'
        ctx.font = `600 30px ${FONT}`
        ctx.fillText(label, 120, y + 22)
      }
      ctx.fillStyle = '#111'
      ctx.font = `700 40px ${FONT}`
      textLines.forEach((line, i) => ctx.fillText(line.map((tk) => tk.word).join(' '), 120, y + top + i * 50))
      y += h + 24
    }
  }
  ctx.restore()
}
