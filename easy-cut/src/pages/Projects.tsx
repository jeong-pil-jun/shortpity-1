import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { deleteProject, importLocalProjects, listLocalProjects, listProjects } from '../lib/storage'
import type { Project } from '../lib/types'
import { getTemplate } from '../lib/templates'
import { formatTime } from '../lib/util'
import { ytThumb } from '../lib/youtube'

export default function Projects() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [localCount, setLocalCount] = useState(() => listLocalProjects().length)
  const [importing, setImporting] = useState(false)

  const refresh = () =>
    listProjects().then(setProjects, (e) => setError(e instanceof Error ? e.message : 'Failed to load projects.'))

  useEffect(() => {
    void refresh()
  }, [])

  const remove = async (project: Project) => {
    try {
      await deleteProject(project)
      setProjects((ps) => ps && ps.filter((p) => p.id !== project.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete.')
    }
    setConfirmId(null)
  }

  const importLocal = async () => {
    setImporting(true)
    setError('')
    try {
      await importLocalProjects(user!.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    }
    setLocalCount(listLocalProjects().length)
    setImporting(false)
    await refresh()
  }

  return (
    <div className="container page">
      <div className="page-head">
        <h1>My Projects</h1>
        <Link to="/create" className="btn btn-primary">
          + Create new Shorts
        </Link>
      </div>
      {localCount > 0 && (
        <div className="notice">
          You have {localCount} older project(s) saved only in this browser. Move them to your account to keep working on any device.{' '}
          <button className="btn btn-outline btn-sm" onClick={importLocal} disabled={importing}>
            {importing ? 'Importing…' : 'Import to my account'}
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {projects === null ? (
        !error && <div className="card empty">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="card empty">
          <p>You haven't created any projects yet.</p>
          <Link to="/create" className="btn btn-primary">
            Create your first Short
          </Link>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <div className="card project-card" key={p.id}>
              <Link to={`/create/${p.id}`} className="thumb" style={{ background: getTemplate(p.templateId).background }}>
                {p.source.type === 'youtube' ? <img src={ytThumb(p.source.videoId)} alt="" /> : <span className="thumb-icon">🎬</span>}
                <span className="thumb-badge">{p.source.type === 'youtube' ? 'YouTube' : 'File'}</span>
              </Link>
              <div className="project-info">
                <Link to={`/create/${p.id}`}>
                  <strong>{p.name}</strong>
                </Link>
                <span className="muted small">
                  {p.segments.length} Shorts · Source {formatTime(p.duration)} · {new Date(p.updatedAt).toLocaleDateString('en-US')}
                </span>
              </div>
              <div className="project-actions">
                {confirmId === p.id ? (
                  <>
                    <span className="small">Delete?</span>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>
                      Delete
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(p.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
