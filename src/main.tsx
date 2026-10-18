import { useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './app.css'
import {
  type Attendance,
  type EventReview,
  type LumaUrl,
  type PendingEvent,
  type QuestionKey,
  type ReviewerStatus,
} from './domain.ts'
import { listPending, openEvent, saveFinal, setStatus } from './review.ts'
import { currentReviewer, signIn, signOut, type Reviewer } from './session.ts'

type Finals = Record<string, string>

export function App() {
  const [ready, setReady] = useState(false)
  const [reviewer, setReviewer] = useState<Reviewer | null>(null)
  const [pending, setPending] = useState<PendingEvent[]>([])
  const [event, setEvent] = useState<EventReview | null>(null)
  const [finals, setFinals] = useState<Finals>({})
  const [email, setEmail] = useState('wail@localhost')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    currentReviewer()
      .then(async (current) => {
        if (cancelled) return
        setReviewer(current)
        if (current) {
          setPending(await listPending())
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setPageError(message(error))
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onSignIn(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    setAuthError(null)
    setBusy(true)
    try {
      const signedIn = await signIn(email, password)
      setReviewer(signedIn)
      setPending(await listPending())
      setEvent(null)
    } catch (error: unknown) {
      setAuthError(message(error))
    } finally {
      setBusy(false)
    }
  }

  async function onSignOut() {
    setBusy(true)
    setPageError(null)
    try {
      await signOut()
      setReviewer(null)
      setPending([])
      setEvent(null)
      setFinals({})
    } catch (error: unknown) {
      setPageError(message(error))
    } finally {
      setBusy(false)
    }
  }

  async function onOpen(lumaUrl: LumaUrl) {
    setBusy(true)
    setPageError(null)
    try {
      const opened = await openEvent(lumaUrl)
      setEvent(opened)
      setFinals(finalsFrom(opened))
    } catch (error: unknown) {
      setPageError(message(error))
    } finally {
      setBusy(false)
    }
  }

  async function onSave(questionKey: QuestionKey) {
    if (!event) return
    const sent = finals[questionKey] ?? ''
    setBusy(true)
    setPageError(null)
    try {
      await saveFinal(event.lumaUrl, questionKey, sent)
      setFinals((current) => ({ ...current, [questionKey]: sent }))
    } catch (error: unknown) {
      setPageError(message(error))
    } finally {
      setBusy(false)
    }
  }

  async function onStatus(status: ReviewerStatus) {
    if (!event) return
    setBusy(true)
    setPageError(null)
    try {
      await setStatus(event.lumaUrl, status)
      setEvent(null)
      setFinals({})
      setPending(await listPending())
    } catch (error: unknown) {
      setPageError(message(error))
    } finally {
      setBusy(false)
    }
  }

  async function onBack() {
    setBusy(true)
    setPageError(null)
    try {
      setEvent(null)
      setFinals({})
      setPending(await listPending())
    } catch (error: unknown) {
      setPageError(message(error))
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return (
      <main>
        <h1>Hackathon radar</h1>
        <p className="muted">Loading the review queue.</p>
      </main>
    )
  }

  return (
    <main>
      <div className="toolbar">
        <h1>Hackathon radar</h1>
        {reviewer ? (
          <button className="secondary" type="button" onClick={() => void onSignOut()} disabled={busy}>
            Sign out
          </button>
        ) : null}
      </div>
      {reviewer ? <p className="muted">{reviewer.email}</p> : null}
      {pageError ? <p className="error">{pageError}</p> : null}
      {!reviewer ? (
        <form onSubmit={(formEvent) => void onSignIn(formEvent)}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(change) => setEmail(change.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(change) => setPassword(change.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            Sign in
          </button>
          {authError ? <p className="error">{authError}</p> : null}
        </form>
      ) : event ? (
        <EventView
          event={event}
          finals={finals}
          busy={busy}
          onFinalChange={(questionKey, value) =>
            setFinals((current) => ({ ...current, [questionKey]: value }))
          }
          onSave={(questionKey) => void onSave(questionKey)}
          onStatus={(status) => void onStatus(status)}
          onBack={() => void onBack()}
        />
      ) : (
        <PendingList pending={pending} busy={busy} onOpen={(lumaUrl) => void onOpen(lumaUrl)} />
      )}
    </main>
  )
}

function PendingList({
  pending,
  busy,
  onOpen,
}: {
  pending: PendingEvent[]
  busy: boolean
  onOpen: (lumaUrl: LumaUrl) => void
}) {
  if (pending.length === 0) {
    return <p>No pending hackathons.</p>
  }
  return (
    <ul className="queue">
      {pending.map((item) => (
        <li key={item.lumaUrl}>
          <button className="card" type="button" disabled={busy} onClick={() => onOpen(item.lumaUrl)}>
            <strong>{item.title}</strong>
            <span>{formatWhen(item.startsAt)}</span>
            <span>{placeLabel(item.attendance)}</span>
            <span>{item.host}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function EventView({
  event,
  finals,
  busy,
  onFinalChange,
  onSave,
  onStatus,
  onBack,
}: {
  event: EventReview
  finals: Finals
  busy: boolean
  onFinalChange: (questionKey: QuestionKey, value: string) => void
  onSave: (questionKey: QuestionKey) => void
  onStatus: (status: ReviewerStatus) => void
  onBack: () => void
}) {
  return (
    <article className="event">
      <p className="muted">{event.lumaUrl}</p>
      <h2>{event.title}</h2>
      <p>
        {formatWhen(event.startsAt)} to {formatWhen(event.endsAt)}
      </p>
      <p>{placeLabel(event.attendance)}</p>
      <p>{event.host}</p>
      <p>Status: {event.status}</p>
      {event.questions.map((question) => (
        <section className="question" key={question.questionKey}>
          <h3>{question.question}</h3>
          <p className="draft">{question.draft}</p>
          <label>
            Final
            <textarea
              value={finals[question.questionKey] ?? ''}
              onChange={(change) => onFinalChange(question.questionKey, change.target.value)}
            />
          </label>
          <button type="button" disabled={busy} onClick={() => onSave(question.questionKey)}>
            Save
          </button>
        </section>
      ))}
      <div className="actions">
        <button type="button" disabled={busy} onClick={() => onStatus('approved')}>
          Approve
        </button>
        <button type="button" disabled={busy} onClick={() => onStatus('skipped')}>
          Skip
        </button>
        <button type="button" disabled={busy} onClick={() => onStatus('applied')}>
          Applied
        </button>
        <button className="secondary" type="button" disabled={busy} onClick={onBack}>
          Back
        </button>
      </div>
    </article>
  )
}

function finalsFrom(event: EventReview): Finals {
  const finals: Finals = {}
  for (const question of event.questions) {
    finals[question.questionKey] = question.final
  }
  return finals
}

function placeLabel(attendance: Attendance): string {
  return attendance.kind === 'online' ? 'online' : attendance.name
}

function formatWhen(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('missing root')
}
createRoot(root).render(<App />)
