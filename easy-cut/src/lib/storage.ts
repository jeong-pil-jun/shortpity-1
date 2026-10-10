import { supabase } from './supabase'
import type { Project } from './types'

const VIDEO_BUCKET = 'videos'

// ---- Projects live in the Supabase "projects" table (RLS: owner only) ----

interface ProjectRow {
  id: string
  name: string
  source: Project['source']
  duration: number
  energy: number[]
  segments: Project['segments']
  template_id: string
  video_path: string | null
  created_at: string
  updated_at: string
}

const fromRow = (r: ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  source: r.source,
  duration: r.duration,
  energy: r.energy,
  segments: r.segments,
  templateId: r.template_id,
  videoPath: r.video_path ?? undefined,
  createdAt: Date.parse(r.created_at),
  updatedAt: Date.parse(r.updated_at),
})

const toRow = (p: Project): Omit<ProjectRow, 'updated_at'> & { updated_at?: string } => ({
  id: p.id,
  name: p.name,
  source: p.source,
  duration: p.duration,
  energy: p.energy,
  segments: p.segments,
  template_id: p.templateId,
  video_path: p.videoPath ?? null,
  created_at: new Date(p.createdAt).toISOString(),
})

function dbError(error: { message: string; code?: string }): never {
  if (error.code === '42P01' || error.code === 'PGRST205')
    throw new Error('The projects table does not exist. Run the SQL in supabase/migrations first.')
  throw new Error(`Database error: ${error.message}`)
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false })
  if (error) dbError(error)
  return (data as ProjectRow[]).map(fromRow)
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle()
  if (error) dbError(error)
  return data ? fromRow(data as ProjectRow) : null
}

export async function saveProject(project: Project) {
  const { error } = await supabase.from('projects').upsert({ ...toRow(project), updated_at: new Date().toISOString() })
  if (error) dbError(error)
}

export async function deleteProject(project: Project) {
  const { error } = await supabase.from('projects').delete().eq('id', project.id)
  if (error) dbError(error)
  if (project.videoPath) await supabase.storage.from(VIDEO_BUCKET).remove([project.videoPath])
  await uncacheVideo(project.id)
}

// ---- Video files live in the private "videos" bucket at "<user_id>/<project_id>" ----

/** Uploads the source video and returns its storage path */
export async function uploadVideo(userId: string, projectId: string, file: Blob): Promise<string> {
  const path = `${userId}/${projectId}`
  const { error } = await supabase.storage
    .from(VIDEO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'video/mp4' })
  if (error) {
    if (/maximum allowed size|too large|413/i.test(error.message))
      throw new Error('The video file exceeds the upload size limit. (Supabase free plan allows up to 50MB per file)')
    if (/bucket not found/i.test(error.message))
      throw new Error('The videos bucket does not exist. Run the SQL in supabase/migrations first.')
    throw new Error(`Video upload failed: ${error.message}`)
  }
  await cacheVideo(projectId, file)
  return path
}

/** Returns the project's video, from the local cache when possible */
export async function loadVideo(project: Project): Promise<Blob | undefined> {
  const cached = await tx<Blob | undefined>('readonly', (s) => s.get(project.id)).catch(() => undefined)
  if (cached) return cached
  if (!project.videoPath) return undefined
  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).download(project.videoPath)
  if (error) throw new Error(`Video download failed: ${error.message}`)
  await cacheVideo(project.id, data)
  return data
}

// ---- IndexedDB: local cache of video blobs so reopening a project doesn't re-download ----

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('easycut', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('videos')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('videos', mode).objectStore('videos'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// Cache failures (quota, private mode) are never fatal
const cacheVideo = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id)).catch(() => undefined)
const uncacheVideo = (id: string) => tx('readwrite', (s) => s.delete(id)).catch(() => undefined)

// ---- Legacy: projects saved in localStorage before accounts existed ----

const LEGACY_KEY = 'easycut.projects'

export function listLocalProjects(): Project[] {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]') as Project[]
  } catch {
    return []
  }
}

/** Moves browser-only projects (and their videos) into the signed-in account. Returns how many moved. */
export async function importLocalProjects(userId: string): Promise<number> {
  let remaining = listLocalProjects()
  let moved = 0
  for (const p of [...remaining]) {
    const project = { ...p }
    if (p.source.type === 'file') {
      const blob = await tx<Blob | undefined>('readonly', (s) => s.get(p.id)).catch(() => undefined)
      if (blob) project.videoPath = await uploadVideo(userId, p.id, blob)
    }
    await saveProject(project)
    moved++
    remaining = remaining.filter((r) => r.id !== p.id)
    localStorage.setItem(LEGACY_KEY, JSON.stringify(remaining))
  }
  if (remaining.length === 0) localStorage.removeItem(LEGACY_KEY)
  return moved
}
