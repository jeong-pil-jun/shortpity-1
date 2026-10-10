import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SourceInput, { type SourceSelection } from '../components/SourceInput'

const STEPS = [
  { icon: '⬆', title: 'Upload a video', text: 'Upload a video file you have the rights to. YouTube links are used only for preview and clip selection.' },
  { icon: '✨', title: 'Automatic highlight extraction', text: 'Analyzes audio energy to suggest loud, dynamic sections as Short candidates.' },
  { icon: '📱', title: 'Edit and export', text: 'Polish subtitles, highlights, and text cards, then save uploaded videos as 9:16 vertical videos.' },
]

const GENRES = ['Interviews · Podcasts', 'Entertainment · Reactions', 'Lectures · Education', 'Gaming streams', 'Vlogs', 'Sports highlights']


const FAQ = [
  { q: 'Is it really free?', a: 'Yes. Highlight analysis and video rendering both happen inside your browser, so you can use it for free on the Free plan.' },
  { q: 'How are highlights found?', a: 'The audio is analyzed in 0.5-second steps, scoring sections with high average loudness and sudden peaks (laughter, cheering, applause, etc.), and the top non-overlapping sections are suggested as candidates.' },
  { q: 'Can I export videos from a YouTube link?', a: 'Due to YouTube policies and browser security restrictions, the original video cannot be downloaded. Link mode supports clip selection, subtitles, preview, and SRT/timestamp export; to export a video file, upload an original file you have the rights to.' },
  { q: 'What format are exported videos?', a: '720×1280 (9:16) vertical video. Saved as MP4 if your browser supports it, otherwise WEBM.' },
  { q: 'Where are my projects saved?', a: 'In your signed-in account. Only you can access your projects and original videos, and you can pick up where you left off on any device.' },
]


export default function Home() {
  const navigate = useNavigate()
  const location = useLocation()
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  useEffect(() => {
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' })
  }, [location.hash])

  const onSelect = (source: SourceSelection) => navigate('/create', { state: { source } })

  return (
    <>
      <section className="hero">
        <div className="container hero-inner">
          <span className="pill">✨ Long video → Shorts, automatically</span>
          <h1>
            Turn one long video
            <br />
            into <span className="gradient-text">viral Shorts</span>
          </h1>
          <p className="lead">From highlight extraction to titles, subtitles, and text cards. Quickly create 30–60s Short candidates from a single video.</p>
          <SourceInput onSelect={onSelect} />
          <p className="muted small">
            Only use videos you have the rights to. YouTube videos are never downloaded; link mode only supports clip selection and timestamp/subtitle export.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">Done in 3 steps</h2>
          <div className="grid-3">
            {STEPS.map((s, i) => (
              <div className="card step" key={s.title}>
                <div className="step-num">STEP {i + 1}</div>
                <div className="step-icon">{s.icon}</div>
                <h3>{s.title}</h3>
                <p className="muted">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container feature-row">
          <div>
            <h2>Works for every genre</h2>
            <p className="muted">From conversational interviews to roaring gaming streams, get started right away with a template that fits your genre.</p>
            <div className="chips">
              {GENRES.map((g) => (
                <span className="chip" key={g}>
                  {g}
                </span>
              ))}
            </div>
            <Link to="/templates" className="btn btn-outline">
              Browse templates →
            </Link>
          </div>
          <div className="phone-mock">
            <div className="phone-title">
              <em>Everyone</em> laughed at this scene
            </div>
            <div className="phone-video">▶</div>
            <div className="phone-sub">
              A truly <em>legendary</em> moment
            </div>
            <div className="phone-comment">
              <small>Key point</small>
              <p>This is where the mood shifts</p>
            </div>
          </div>
        </div>
      </section>


      <section className="section alt" id="faq">
        <div className="container narrow">
          <h2 className="section-title">Frequently asked questions</h2>
          {FAQ.map((f, i) => (
            <div className={`faq ${openFaq === i ? 'open' : ''}`} key={f.q}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {f.q}
                <span>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && <p className="muted">{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="section cta">
        <div className="container">
          <h2>Create your first Short now</h2>
          <Link to="/create" className="btn btn-primary btn-lg">
            Get started for free
          </Link>
        </div>
      </section>
    </>
  )
}
