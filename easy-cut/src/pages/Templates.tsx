import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { makeSegment } from '../lib/highlights'
import { drawFrame } from '../lib/render'
import { TEMPLATES } from '../lib/templates'
import type { Template } from '../lib/types'

const SAMPLE = (() => {
  const s = makeSegment(0, 30, '*Everyone* laughed at this scene', 1)
  s.subtitles = [{ id: 'x', start: 0, end: 30, text: 'A truly *legendary* moment' }]
  s.comments = [{ id: 'c', author: 'Key point', text: 'This is where the mood shifts' }]
  return s
})()

function TemplatePreview({ template }: { template: Template }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!
    drawFrame(ctx, null, SAMPLE, template, 29)
    // Placeholder for the video area
    ctx.save()
    ctx.scale(ctx.canvas.width / 1080, ctx.canvas.width / 1080)
    const vh = template.layout === 'crop' ? 0 : 607
    if (vh) {
      ctx.fillStyle = 'rgba(128,128,140,0.35)'
      ctx.fillRect(0, (1920 - vh) / 2, 1080, vh)
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.font = '120px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('▶', 540, 960)
    }
    ctx.restore()
  }, [template])
  return <canvas ref={ref} width={270} height={480} />
}

export default function Templates() {
  const navigate = useNavigate()
  return (
    <div className="container page">
      <h1>Templates</h1>
      <p className="muted">Pick a style that fits your genre and get started. You can change it anytime while editing.</p>
      <div className="template-showcase">
        {TEMPLATES.map((t) => (
          <div className="card template-item" key={t.id}>
            <TemplatePreview template={t} />
            <h3>{t.name}</h3>
            <p className="muted small">{t.description}</p>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/create', { state: { templateId: t.id } })}>
              Start with this template
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
