import { drawFrame } from './render'
import type { Segment, Template } from './types'

const audioGraphs = new WeakMap<HTMLVideoElement, { ctx: AudioContext; dest: MediaStreamAudioDestinationNode }>()

/**
 * Routes the video's audio through Web Audio so it can be recorded.
 * createMediaElementSource may only be called once per element, so cache it.
 * Audio keeps playing to the speakers as well.
 */
function audioGraph(video: HTMLVideoElement) {
  let g = audioGraphs.get(video)
  if (!g) {
    const ctx = new AudioContext()
    const src = ctx.createMediaElementSource(video)
    const dest = ctx.createMediaStreamDestination()
    src.connect(dest)
    src.connect(ctx.destination)
    g = { ctx, dest }
    audioGraphs.set(video, g)
  }
  return g
}

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }

/** Prefer the element's own capture stream; fall back to Web Audio where it isn't supported (Safari). */
function audioTracks(video: CapturableVideo): MediaStreamTrack[] {
  const capture = video.captureStream ?? video.mozCaptureStream
  if (capture) return capture.call(video).getAudioTracks()
  const { ctx, dest } = audioGraph(video)
  void ctx.resume()
  return dest.stream.getAudioTracks()
}

export function pickMimeType(): string {
  const candidates = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm'
}

export interface ExportJob {
  promise: Promise<Blob>
  cancel: () => void
}

/**
 * Plays the segment in real time while drawing frames to a canvas and recording
 * canvas + audio with MediaRecorder. Produces a 720x1280 vertical video.
 */
export function exportSegment(
  video: HTMLVideoElement,
  segment: Segment,
  tpl: Template,
  onProgress: (p: number) => void,
): ExportJob {
  let cancelled = false
  let stop = () => {}

  const promise = new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 1280
    const ctx = canvas.getContext('2d')!
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...audioTracks(video)])
    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      if (cancelled) reject(new DOMException('cancelled', 'AbortError'))
      else resolve(new Blob(chunks, { type: mimeType.split(';')[0] }))
    }

    let raf = 0
    stop = () => {
      cancelAnimationFrame(raf)
      video.pause()
      if (recorder.state !== 'inactive') recorder.stop()
    }

    const loop = () => {
      const t = video.currentTime - segment.start
      drawFrame(ctx, video, segment, tpl, t)
      onProgress(Math.min(1, t / (segment.end - segment.start)))
      if (video.currentTime >= segment.end || video.ended) return stop()
      raf = requestAnimationFrame(loop)
    }

    video.muted = false
    video.currentTime = segment.start
    video.addEventListener(
      'seeked',
      () => {
        drawFrame(ctx, video, segment, tpl, 0)
        recorder.start(250)
        video.play().then(loop, (err) => {
          stop()
          reject(err)
        })
      },
      { once: true },
    )
  })

  return {
    promise,
    cancel: () => {
      cancelled = true
      stop()
    },
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
