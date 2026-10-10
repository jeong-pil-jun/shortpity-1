import { Link } from 'react-router-dom'

const SECTIONS = [
  {
    title: '1. Add a video',
    items: [
      'YouTube link: select clips, add subtitles, preview, and export timestamps/SRT.',
      'File upload: automatically extract highlights via audio analysis and export as 9:16 video files.',
      'First choose the number of clips (1–10), length (15–60s), and a starting template.',
    ],
  },
  {
    title: '2. Review highlights',
    items: [
      'The list on the left is sorted by score. Longer bars mean louder, more dynamic sections.',
      'The timeline at the bottom shows the loudness curve of the whole source and where each Short sits; click to jump.',
      'You can also create your own clip with “+ Add”.',
    ],
  },
  {
    title: '3. Edit',
    items: [
      'Clip tab: adjust the title and start/end. The “Set start to current” button is handy during playback.',
      'Subtitles tab: add a subtitle at the current time, or paste a script to auto-place. Words wrapped in *asterisks* are shown in the highlight color.',
      'Text cards tab: write cards that appear in order over the video. Use them for key takeaways or to quote real viewer reactions.',
      'Style tab: changing the template updates the preview instantly.',
    ],
  },
  {
    title: '4. Export',
    items: [
      '“Export this Short” saves the selected Short; “Export all” saves every Short one after another.',
      'Rendering plays and records in real time, so it takes as long as the Short itself. Keep the tab active.',
      'Saved files can be uploaded as-is to YouTube Shorts, Instagram Reels, and TikTok.',
    ],
  },
]

export default function Guide() {
  return (
    <div className="container page narrow">
      <h1>Guide</h1>
      {SECTIONS.map((s) => (
        <div className="card guide-section" key={s.title}>
          <h3>{s.title}</h3>
          <ul>
            {s.items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ))}
      <div className="center">
        <Link to="/create" className="btn btn-primary btn-lg">
          Try it now
        </Link>
      </div>
    </div>
  )
}
