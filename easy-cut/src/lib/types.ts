export interface Subtitle {
  id: string
  /** seconds, relative to segment start */
  start: number
  end: number
  /** words wrapped in *asterisks* are emphasized */
  text: string
}

/** A user-written text card overlaid on the clip (e.g. a key point or a real viewer quote) */
export interface OverlayComment {
  id: string
  /** optional label shown above the text */
  author: string
  text: string
  /** legacy field from generated comments; no longer shown */
  likes?: number
}

export interface Segment {
  id: string
  /** seconds, absolute in source video */
  start: number
  end: number
  title: string
  score: number
  subtitles: Subtitle[]
  comments: OverlayComment[]
}

export type ProjectSource =
  | { type: 'file'; name: string; mime: string }
  | { type: 'youtube'; videoId: string; url: string }

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  source: ProjectSource
  duration: number
  /** downsampled loudness curve (0..1) for the timeline */
  energy: number[]
  segments: Segment[]
  templateId: string
  /** Supabase Storage path of the uploaded source video (file projects only) */
  videoPath?: string
}

export interface Template {
  id: string
  name: string
  description: string
  background: string
  titleColor: string
  titleBackground: string
  subtitleColor: string
  subtitleStroke: string
  emphasisColor: string
  fontScale: number
  layout: 'fit' | 'crop'
  showComments: boolean
}
