import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Editor from '../components/Editor'
import SourceInput, { type SourceSelection } from '../components/SourceInput'
import { analyzeAudio, downsample, evenSegments, findHighlights } from '../lib/highlights'
import { useAuth } from '../lib/auth'
import { getProject, loadVideo, saveProject, uploadVideo } from '../lib/storage'
import { TEMPLATES } from '../lib/templates'
import type { Project } from '../lib/types'
import { uid } from '../lib/util'

function videoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => resolve(v.duration)
    v.onerror = () => reject(new Error('This video format cannot be played by your browser.'))
    v.src = url
  })
}

export default function Create() {
  const { projectId } = useParams()
  return projectId ? <ProjectView key={projectId} projectId={projectId} /> : <NewProject />
}

function ProjectView({ projectId }: { projectId: string }) {
  // undefined = still loading, null = not found
  const [project, setProject] = useState<Project | null>()
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let url: string | null = null
    let cancelled = false
    ;(async () => {
      const p = await getProject(projectId)
      if (cancelled) return
      setProject(p)
      if (p?.source.type !== 'file') return
      const blob = await loadVideo(p)
      if (cancelled) return
      if (!blob) return setError('The saved video file could not be found.')
      url = URL.createObjectURL(blob)
      setVideoUrl(url)
    })().catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load the project.'))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [projectId])

  if (project === undefined) return <div className="container page empty">{error || 'Loading project…'}</div>
  if (!project)
    return (
      <div className="container page empty">
        <h2>Project not found</h2>
        <Link to="/create" className="btn btn-primary">
          Create new
        </Link>
      </div>
    )
  if (project.source.type === 'file' && !videoUrl) return <div className="container page empty">{error || 'Loading video…'}</div>
  return <Editor initial={project} videoUrl={videoUrl} />
}

function NewProject() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null)
  const [error, setError] = useState('')
  const [count, setCount] = useState(5)
  const [length, setLength] = useState(45)
  const [templateId, setTemplateId] = useState<string>(
    (location.state as { templateId?: string } | null)?.templateId ?? TEMPLATES[0].id,
  )
  const pendingSource = useRef((location.state as { source?: SourceSelection } | null)?.source)

  const start = async (source: SourceSelection) => {
    setError('')
    const id = uid()
    const base = {
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      templateId,
      energy: [] as number[],
      segments: [],
    }
    try {
      if (source.kind === 'youtube') {
        // Duration and candidate clips are filled in by the editor once the player loads
        const project: Project = {
          ...base,
          name: `YouTube video ${source.videoId}`,
          source: { type: 'youtube', videoId: source.videoId, url: source.url },
          duration: 0,
        }
        await saveProject(project)
        sessionStorage.setItem(`shortpity.pending.${id}`, JSON.stringify({ count, length }))
        navigate(`/create/${id}`, { replace: true })
        return
      }

      const { file } = source
      const name = file.name.replace(/\.[^.]+$/, '')
      setBusy({ label: 'Checking video…', progress: 0.02 })
      const tmpUrl = URL.createObjectURL(file)
      const duration = await videoDuration(tmpUrl).finally(() => URL.revokeObjectURL(tmpUrl))
      // Upload runs alongside the audio analysis; a failure is surfaced once analysis finishes
      const upload = uploadVideo(user!.id, id, file)
      upload.catch(() => undefined)

      setBusy({ label: 'Analyzing audio… (may take tens of seconds depending on video length)', progress: 0.05 })
      let segments, energy: number[] = []
      try {
        const analysis = await analyzeAudio(file, (p) => setBusy((b) => b && { ...b, progress: p }))
        energy = downsample(analysis.energy)
        segments = findHighlights(analysis, { count, length, baseTitle: name })
      } catch {
        // No audio track or unsupported codec: fall back to evenly spaced clips
        segments = evenSegments(duration, count, length, name)
      }
      setBusy({ label: 'Uploading video… (may take a while depending on file size)', progress: 1 })
      const project: Project = {
        ...base,
        name,
        source: { type: 'file', name: file.name, mime: file.type },
        duration,
        energy,
        segments,
        videoPath: await upload,
      }
      await saveProject(project)
      setBusy(null)
      navigate(`/create/${id}`, { replace: true })
    } catch (e) {
      setBusy(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    if (pendingSource.current) {
      const s = pendingSource.current
      pendingSource.current = undefined
      void start(s)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="container page narrow">
      <h1>Create new Shorts</h1>
      <p className="muted">Paste a YouTube link or upload a video file. Video analysis happens in your browser, and your original files and projects are stored securely in your account.</p>

      {busy ? (
        <div className="card processing">
          <div className="spinner" />
          <p>{busy.label}</p>
          <div className="progress">
            <div style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
        </div>
      ) : (
        <>
          <div className="card options">
            <label>
              Number of Shorts to extract
              <select value={count} onChange={(e) => setCount(+e.target.value)}>
                {[1, 3, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Short length
              <select value={length} onChange={(e) => setLength(+e.target.value)}>
                {[15, 30, 45, 60].map((n) => (
                  <option key={n} value={n}>
                    {n}s
                  </option>
                ))}
              </select>
            </label>
            <label>
              Template
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <SourceInput compact onSelect={start} />
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  )
}
