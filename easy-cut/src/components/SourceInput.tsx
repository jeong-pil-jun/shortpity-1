import { useRef, useState, type DragEvent } from 'react'
import { parseYouTubeId } from '../lib/util'

export type SourceSelection = { kind: 'file'; file: File } | { kind: 'youtube'; videoId: string; url: string }

/** URL box + drag-and-drop upload, shared by the landing hero and the create page. */
export default function SourceInput({ onSelect, compact }: { onSelect: (s: SourceSelection) => void; compact?: boolean }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const submitUrl = () => {
    const id = parseYouTubeId(url)
    if (!id) return setError('Please enter a valid YouTube link. (e.g. https://youtu.be/xxxxxxxxxxx)')
    setError('')
    onSelect({ kind: 'youtube', videoId: id, url })
  }

  const pickFile = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('video/')) return setError('Only video files can be uploaded.')
    setError('')
    onSelect({ kind: 'file', file })
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    pickFile(e.dataTransfer.files[0])
  }

  return (
    <div
      className={`source-input ${compact ? 'compact' : ''} ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <form
        className="url-row"
        onSubmit={(e) => {
          e.preventDefault()
          submitUrl()
        }}
      >
        <span className="yt-icon">▶</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a YouTube link" />
        <button className="btn btn-primary" type="submit">
          Create Shorts
        </button>
      </form>
      <div className="or">
        <span>or</span>
      </div>
      <button type="button" className="upload-btn" onClick={() => fileRef.current?.click()}>
        ⬆ Upload a video file <span className="muted">(drag & drop supported · MP4, MOV, WEBM)</span>
      </button>
      <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
      {error && <p className="error">{error}</p>}
    </div>
  )
}
