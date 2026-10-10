import { useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from 'react'
import { H, videoRect, W } from '../lib/render'
import type { Template } from '../lib/types'
import { loadYouTubeApi, type YTPlayer } from '../lib/youtube'

export interface YouTubeHandle {
  play(): void
  pause(): void
  seek(t: number): void
}

interface Props {
  ref: Ref<YouTubeHandle>
  videoId: string
  template: Template
  /** overlay canvas drawn by the editor (background, title, subtitles, comments) */
  canvasRef: RefObject<HTMLCanvasElement | null>
  onReady: (duration: number) => void
  onTime: (t: number) => void
  onPlayingChange: (playing: boolean) => void
}

/**
 * The YouTube iframe sits on top of the overlay canvas, positioned exactly where
 * the renderer would draw the video, so the layout matches the exported shorts.
 */
export default function YouTubePreview({ ref, videoId, template, canvasRef, onReady, onTime, onPlayingChange }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [error, setError] = useState('')
  const callbacks = useRef({ onReady, onTime, onPlayingChange })
  useEffect(() => {
    callbacks.current = { onReady, onTime, onPlayingChange }
  })

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo?.(),
    pause: () => playerRef.current?.pauseVideo?.(),
    seek: (t) => playerRef.current?.seekTo?.(t, true),
  }))

  useEffect(() => {
    let cancelled = false
    let timer = 0
    const host = document.createElement('div')
    mountRef.current!.appendChild(host)
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return
        playerRef.current = new YT.Player(host, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0 },
          events: {
            onReady: () => callbacks.current.onReady(playerRef.current!.getDuration()),
            onStateChange: (e) => callbacks.current.onPlayingChange(e.data === 1),
          },
        })
        timer = window.setInterval(() => {
          const p = playerRef.current
          if (p?.getPlayerState?.() === 1) callbacks.current.onTime(p.getCurrentTime())
        }, 100)
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      cancelled = true
      clearInterval(timer)
      playerRef.current?.destroy()
      playerRef.current = null
      host.remove()
    }
  }, [videoId])

  const r = videoRect(template, 16 / 9)
  return (
    <>
      <canvas ref={canvasRef} width={540} height={960} />
      <div
        ref={mountRef}
        className="yt-slot"
        style={{ left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`, width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%` }}
      />
      {error && <div className="export-overlay">{error}</div>}
    </>
  )
}
