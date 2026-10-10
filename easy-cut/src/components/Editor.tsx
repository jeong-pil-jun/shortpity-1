import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { downloadBlob, exportSegment, type ExportJob } from '../lib/exporter'
import { evenSegments, makeSegment } from '../lib/highlights'
import { drawFrame } from '../lib/render'
import { saveProject } from '../lib/storage'
import { getTemplate, TEMPLATES } from '../lib/templates'
import type { Project, Segment, Subtitle } from '../lib/types'
import { clamp, formatTime, parseTime, uid } from '../lib/util'
import Timeline from './Timeline'
import YouTubePreview, { type YouTubeHandle } from './YouTubePreview'

type Tab = 'clip' | 'subs' | 'comments' | 'style'

const precise = (s: number) => `${formatTime(s)}.${Math.floor((s % 1) * 10)}`

function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Free-form text only while focused; otherwise always mirror the value
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const v = parseTime(draft ?? '')
    if (Number.isFinite(v)) onChange(v)
    setDraft(null)
  }
  return (
    <input
      className="time-input"
      value={draft ?? precise(value)}
      onFocus={() => setDraft(precise(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

function toSrt(subs: Subtitle[]) {
  const ts = (s: number) => {
    const ms = Math.round(s * 1000)
    const h = Math.floor(ms / 3_600_000)
    const m = Math.floor((ms % 3_600_000) / 60_000)
    const sec = Math.floor((ms % 60_000) / 1000)
    const pad = (n: number, l = 2) => String(n).padStart(l, '0')
    return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms % 1000, 3)}`
  }
  return [...subs]
    .sort((a, b) => a.start - b.start)
    .map((s, i) => `${i + 1}\n${ts(s.start)} --> ${ts(s.end)}\n${s.text.replaceAll('*', '')}\n`)
    .join('\n')
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) || 'short'

export default function Editor({ initial, videoUrl }: { initial: Project; videoUrl: string | null }) {
  const [project, setProject] = useState(initial)
  const [selectedId, setSelectedId] = useState(initial.segments[0]?.id ?? '')
  const [tab, setTab] = useState<Tab>('clip')
  const [time, setTime] = useState(initial.segments[0]?.start ?? 0)
  const [playing, setPlaying] = useState(false)
  const [exporting, setExporting] = useState<{ label: string; progress: number } | null>(null)
  const [bulkText, setBulkText] = useState('')
  const [toast, setToast] = useState('')
  // Last project state confirmed saved to Supabase; anything newer is pending
  const [savedProject, setSavedProject] = useState(initial)
  const [saveFailed, setSaveFailed] = useState(false)
  const saveState = project === savedProject ? 'saved' : saveFailed ? 'error' : 'saving'

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ytRef = useRef<YouTubeHandle>(null)
  const jobRef = useRef<ExportJob | null>(null)
  const cancelAllRef = useRef(false)

  const isYouTube = project.source.type === 'youtube'
  const segment = project.segments.find((s) => s.id === selectedId) ?? project.segments[0]
  const template = useMemo(() => {
    const t = getTemplate(project.templateId)
    // A cross-origin iframe can't be cropped/redrawn, so YouTube previews always use the fit layout
    return isYouTube ? { ...t, layout: 'fit' as const } : t
  }, [project.templateId, isYouTube])
  const rel = segment ? time - segment.start : 0

  // Autosave to Supabase, debounced so typing doesn't fire a request per keystroke
  const latest = useRef(project)
  const dirty = useRef(false)
  useEffect(() => {
    latest.current = project
    if (project === initial) return
    dirty.current = true
    const t = setTimeout(() => {
      dirty.current = false
      saveProject(project).then(
        () => {
          setSavedProject(project)
          setSaveFailed(false)
        },
        () => setSaveFailed(true),
      )
    }, 800)
    return () => clearTimeout(t)
  }, [project, initial])
  // Flush a pending change when leaving the editor
  useEffect(
    () => () => {
      if (dirty.current) void saveProject(latest.current).catch(() => undefined)
    },
    [],
  )

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  // ---------- project mutations ----------
  const patchSegment = useCallback(
    (id: string, patch: Partial<Segment> | ((s: Segment) => Partial<Segment>)) =>
      setProject((p) => ({
        ...p,
        segments: p.segments.map((s) => (s.id === id ? { ...s, ...(typeof patch === 'function' ? patch(s) : patch) } : s)),
      })),
    [],
  )

  const addSegment = () => {
    const dur = project.duration || 30
    const start = clamp(time, 0, Math.max(0, dur - 30))
    const seg = makeSegment(start, Math.min(dur, start + 30), `New Short (${formatTime(start)})`, 0)
    setProject((p) => ({ ...p, segments: [...p.segments, seg] }))
    selectClip(seg)
  }

  const removeSegment = (id: string) => {
    setProject((p) => ({ ...p, segments: p.segments.filter((s) => s.id !== id) }))
    if (id === segment?.id) selectClip(project.segments.find((s) => s.id !== id))
  }

  // ---------- playback ----------
  const seek = useCallback(
    (abs: number) => {
      setTime(abs)
      if (isYouTube) ytRef.current?.seek(abs)
      else if (videoRef.current) videoRef.current.currentTime = abs
    },
    [isYouTube],
  )

  const pause = useCallback(() => {
    setPlaying(false)
    if (isYouTube) ytRef.current?.pause()
    else videoRef.current?.pause()
  }, [isYouTube])

  const play = () => {
    if (!segment) return
    if (time < segment.start || time >= segment.end - 0.1) seek(segment.start)
    setPlaying(true)
    if (isYouTube) ytRef.current?.play()
    else void videoRef.current?.play()
  }

  // Selecting a clip jumps to its start
  const selectClip = (seg: Segment | undefined) => {
    pause()
    setSelectedId(seg?.id ?? '')
    if (seg) seek(seg.start)
  }

  const redraw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !segment) return
    const t = (isYouTube ? time : (videoRef.current?.currentTime ?? time)) - segment.start
    drawFrame(ctx, isYouTube ? null : videoRef.current, segment, template, t)
  }, [segment, template, time, isYouTube])

  useEffect(redraw, [redraw])

  // File mode: render loop while playing
  useEffect(() => {
    if (isYouTube || !playing || !segment) return
    const video = videoRef.current!
    let raf = 0
    const loop = () => {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawFrame(ctx, video, segment, template, video.currentTime - segment.start)
      setTime(video.currentTime)
      if (video.currentTime >= segment.end || video.ended) {
        pause()
        seek(segment.start)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, segment, template, isYouTube, pause, seek])

  // YouTube mode: the player reports time; stop at clip end
  const onYouTubeTime = (t: number) => {
    setTime(t)
    if (playing && segment && t >= segment.end) {
      pause()
      seek(segment.start)
    }
  }

  // YouTube mode: once the player knows the duration, propose clips
  const onYouTubeReady = (duration: number) => {
    if (project.duration) return
    const key = `shortpity.pending.${project.id}`
    const opts = JSON.parse(sessionStorage.getItem(key) ?? '{"count":5,"length":45}') as { count: number; length: number }
    sessionStorage.removeItem(key)
    const segments = evenSegments(duration, opts.count, opts.length, 'Highlight')
    setProject((p) => ({ ...p, duration, segments }))
    selectClip(segments[0])
  }

  // ---------- subtitles ----------
  const addSubtitle = () => {
    if (!segment) return
    const start = clamp(rel, 0, segment.end - segment.start - 0.5)
    const sub: Subtitle = { id: uid(), start, end: Math.min(segment.end - segment.start, start + 3), text: 'Enter subtitle' }
    patchSegment(segment.id, (s) => ({ subtitles: [...s.subtitles, sub].sort((a, b) => a.start - b.start) }))
  }

  const distributeBulk = () => {
    if (!segment) return
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!lines.length) return
    // Time each line proportionally to its length
    const total = lines.reduce((s, l) => s + l.length, 0)
    const dur = segment.end - segment.start
    let cursor = 0
    const subs = lines.map((text) => {
      const len = (text.length / total) * dur
      const sub = { id: uid(), start: cursor, end: cursor + len, text }
      cursor += len
      return sub
    })
    patchSegment(segment.id, { subtitles: subs })
    setBulkText('')
    flash(`Placed ${subs.length} subtitle lines`)
  }

  const patchSub = (subId: string, patch: Partial<Subtitle>) =>
    segment && patchSegment(segment.id, (s) => ({ subtitles: s.subtitles.map((x) => (x.id === subId ? { ...x, ...patch } : x)) }))

  // ---------- export ----------
  const runExport = async (segs: Segment[]) => {
    const video = videoRef.current
    if (!video) return
    pause()
    cancelAllRef.current = false
    try {
      for (const [i, seg] of segs.entries()) {
        if (cancelAllRef.current) break
        const label = segs.length > 1 ? `(${i + 1}/${segs.length}) ${seg.title}` : seg.title
        setExporting({ label, progress: 0 })
        const job = exportSegment(video, seg, template, (p) => setExporting({ label, progress: p }))
        jobRef.current = job
        const blob = await job.promise
        downloadBlob(blob, `${safeName(seg.title)}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`)
      }
      if (!cancelAllRef.current) flash('Export complete! Check your Downloads folder.')
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) flash(`Export failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      jobRef.current = null
      setExporting(null)
      if (segment) seek(segment.start)
    }
  }

  const cancelExport = () => {
    cancelAllRef.current = true
    jobRef.current?.cancel()
  }

  const copyTimestamps = async () => {
    if (project.source.type !== 'youtube') return
    const { videoId } = project.source
    const text = project.segments
      .map((s) => `${s.title}\n${formatTime(s.start)} ~ ${formatTime(s.end)}  https://youtu.be/${videoId}?t=${Math.floor(s.start)}`)
      .join('\n\n')
    await navigator.clipboard.writeText(text)
    flash('Timestamps copied to clipboard')
  }

  const downloadSrt = () => {
    if (!segment) return
    downloadBlob(new Blob([toSrt(segment.subtitles)], { type: 'text/plain' }), `${safeName(segment.title)}.srt`)
  }

  return (
    <div className="editor">
      <div className="editor-bar">
        <Link to="/projects" className="btn btn-ghost btn-sm">
          ← Projects
        </Link>
        <input className="project-name" value={project.name} onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))} />
        <span className={`small ${saveState === 'error' ? 'warn' : 'muted'}`}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed — check your connection' : 'Auto-saved'}
        </span>
        <div className="spacer" />
        {isYouTube ? (
          <>
            <button className="btn btn-outline btn-sm" onClick={copyTimestamps} disabled={!project.segments.length}>
              Copy timestamps
            </button>
            <button className="btn btn-outline btn-sm" onClick={downloadSrt} disabled={!segment?.subtitles.length}>
              Download SRT
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-outline btn-sm" onClick={() => runExport(project.segments)} disabled={!project.segments.length}>
              Export all
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => segment && runExport([segment])} disabled={!segment}>
              ⬇ Export this Short
            </button>
          </>
        )}
      </div>

      {isYouTube && (
        <div className="notice">
          In YouTube link mode, video files cannot be exported due to copyright and browser security policies. Clip and subtitle editing, preview, and timestamp/SRT export are supported.
          To save as MP4, <Link to="/create">upload</Link> an original file you have the rights to.
        </div>
      )}

      <div className="editor-grid">
        {/* ---------- clip list ---------- */}
        <aside className="panel clip-list">
          <div className="panel-head">
            <h3>{project.segments.length} Short candidates</h3>
            <button className="btn btn-ghost btn-sm" onClick={addSegment}>
              + Add
            </button>
          </div>
          {project.segments.length === 0 && <p className="muted small">{isYouTube ? 'Loading player…' : 'No clips yet.'}</p>}
          {project.segments.map((s, i) => (
            <button key={s.id} className={`clip-item ${s.id === segment?.id ? 'active' : ''}`} onClick={() => selectClip(s)}>
              <span className="clip-idx">{i + 1}</span>
              <span className="clip-body">
                <strong>{s.title.replaceAll('*', '')}</strong>
                <span className="muted small">
                  {formatTime(s.start)} – {formatTime(s.end)} · {Math.round(s.end - s.start)}s
                </span>
                {s.score > 0 && (
                  <span className="score">
                    <span style={{ width: `${Math.round(s.score * 100)}%` }} />
                  </span>
                )}
              </span>
            </button>
          ))}
        </aside>

        {/* ---------- preview ---------- */}
        <section className="preview-col">
          <div className="phone-frame">
            {isYouTube && project.source.type === 'youtube' ? (
              <YouTubePreview
                ref={ytRef}
                videoId={project.source.videoId}
                template={template}
                canvasRef={canvasRef}
                onReady={onYouTubeReady}
                onTime={onYouTubeTime}
                onPlayingChange={setPlaying}
              />
            ) : (
              <>
                <canvas ref={canvasRef} width={540} height={960} />
                <video
                  ref={videoRef}
                  src={videoUrl ?? undefined}
                  className="hidden-video"
                  playsInline
                  preload="auto"
                  onLoadedData={(e) => (e.currentTarget.currentTime = time)}
                  onSeeked={redraw}
                />
              </>
            )}
            {exporting && (
              <div className="export-overlay">
                <div className="spinner" />
                <p>Rendering… Do not close this tab or switch to another tab</p>
                <p className="small">{exporting.label}</p>
                <div className="progress">
                  <div style={{ width: `${Math.round(exporting.progress * 100)}%` }} />
                </div>
                <button className="btn btn-ghost btn-sm" onClick={cancelExport}>
                  Cancel
                </button>
              </div>
            )}
          </div>
          {segment && (
            <div className="player-controls">
              <button className="btn btn-primary round" onClick={playing ? pause : play} disabled={!!exporting}>
                {playing ? '❚❚' : '▶'}
              </button>
              <span className="mono">
                {formatTime(Math.max(0, rel))} / {formatTime(segment.end - segment.start)}
              </span>
              <input
                type="range"
                min={segment.start}
                max={segment.end}
                step={0.1}
                value={clamp(time, segment.start, segment.end)}
                onChange={(e) => seek(+e.target.value)}
              />
            </div>
          )}
        </section>

        {/* ---------- inspector ---------- */}
        <aside className="panel inspector">
          <div className="tabs">
            {(
              [
                ['clip', 'Clip'],
                ['subs', 'Subtitles'],
                ['comments', 'Text cards'],
                ['style', 'Style'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {!segment && tab !== 'style' && <p className="muted small">Select or add a Short on the left.</p>}

          {segment && tab === 'clip' && (
            <div className="form">
              <label>
                Title <span className="muted small">(wrap in *asterisks* to highlight)</span>
                <textarea rows={2} value={segment.title} onChange={(e) => patchSegment(segment.id, { title: e.target.value })} />
              </label>
              <div className="row">
                <label>
                  Start
                  <TimeInput value={segment.start} onChange={(v) => patchSegment(segment.id, { start: clamp(v, 0, segment.end - 1) })} />
                </label>
                <label>
                  End
                  <TimeInput
                    value={segment.end}
                    onChange={(v) => patchSegment(segment.id, { end: clamp(v, segment.start + 1, project.duration || v) })}
                  />
                </label>
              </div>
              <div className="row">
                <button className="btn btn-outline btn-sm" onClick={() => patchSegment(segment.id, { start: Math.min(time, segment.end - 1) })}>
                  Set start to current
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => patchSegment(segment.id, { end: Math.max(time, segment.start + 1) })}>
                  Set end to current
                </button>
              </div>
              <p className="muted small">
                Length {Math.round(segment.end - segment.start)}s {segment.end - segment.start > 60 && '· ⚠ Shorts of 60s or less are recommended'}
              </p>
              <button className="btn btn-danger btn-sm" onClick={() => removeSegment(segment.id)}>
                Delete this Short
              </button>
            </div>
          )}

          {segment && tab === 'subs' && (
            <div className="form">
              <div className="row">
                <button className="btn btn-primary btn-sm" onClick={addSubtitle}>
                  + Add subtitle at current time
                </button>
                <button className="btn btn-ghost btn-sm" onClick={downloadSrt} disabled={!segment.subtitles.length}>
                  SRT
                </button>
              </div>
              {segment.subtitles.map((s) => (
                <div className={`sub-row ${rel >= s.start && rel < s.end ? 'live' : ''}`} key={s.id}>
                  <div className="row">
                    <TimeInput value={s.start} onChange={(v) => patchSub(s.id, { start: Math.max(0, v) })} />
                    <span>→</span>
                    <TimeInput value={s.end} onChange={(v) => patchSub(s.id, { end: Math.max(s.start + 0.2, v) })} />
                    <button
                      className="icon-btn"
                      title="Delete"
                      onClick={() => patchSegment(segment.id, (seg) => ({ subtitles: seg.subtitles.filter((x) => x.id !== s.id) }))}
                    >
                      ✕
                    </button>
                  </div>
                  <input value={s.text} onChange={(e) => patchSub(s.id, { text: e.target.value })} />
                </div>
              ))}
              <details className="bulk">
                <summary>Paste a script and auto-place</summary>
                <p className="muted small">Enter one subtitle per line; timing is split in proportion to character count. (Replaces existing subtitles)</p>
                <textarea rows={5} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'First subtitle\nA word to *highlight* here\nLast subtitle'} />
                <button className="btn btn-outline btn-sm" onClick={distributeBulk}>
                  Auto-place
                </button>
              </details>
            </div>
          )}

          {segment && tab === 'comments' && (
            <div className="form">
              <p className="muted small">
                Text cards you write appear one at a time as the video plays. Use them for key takeaways or to quote real viewer reactions.
              </p>
              <div className="row">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => patchSegment(segment.id, (s) => ({ comments: [...s.comments, { id: uid(), author: '', text: '' }] }))}
                >
                  + Add card
                </button>
              </div>
              {!template.showComments && <p className="warn small">The current template has text cards turned off. Choose a different template in the Style tab.</p>}
              {segment.comments.map((c) => {
                const patchC = (patch: Partial<typeof c>) =>
                  patchSegment(segment.id, (s) => ({ comments: s.comments.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }))
                return (
                  <div className="sub-row" key={c.id}>
                    <div className="row">
                      <input value={c.author} onChange={(e) => patchC({ author: e.target.value })} placeholder="Label (optional)" />
                      <button
                        className="icon-btn"
                        onClick={() => patchSegment(segment.id, (s) => ({ comments: s.comments.filter((x) => x.id !== c.id) }))}
                      >
                        ✕
                      </button>
                    </div>
                    <input value={c.text} onChange={(e) => patchC({ text: e.target.value })} placeholder="Card content" />
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'style' && (
            <div className="template-grid small-grid">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className={`template-card ${t.id === project.templateId ? 'active' : ''}`}
                  onClick={() => setProject((p) => ({ ...p, templateId: t.id }))}
                >
                  <span className="swatch" style={{ background: t.background }}>
                    <i style={{ background: t.titleBackground === 'transparent' ? t.titleColor : t.titleBackground }} />
                    <i style={{ background: t.emphasisColor }} />
                  </span>
                  <strong>{t.name}</strong>
                  <span className="muted small">{t.description}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      {(project.duration > 0 || project.energy.length > 0) && (
        <Timeline
          duration={project.duration}
          energy={project.energy}
          segments={project.segments}
          selectedId={segment?.id}
          time={time}
          onSeek={(t, segId) => {
            if (segId && segId !== segment?.id) selectClip(project.segments.find((s) => s.id === segId))
            else seek(t)
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
