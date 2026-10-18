export const reviewStatuses = ['pending', 'approved', 'skipped', 'applied'] as const
export type ReviewStatus = (typeof reviewStatuses)[number]

export const reviewerStatuses = ['approved', 'skipped', 'applied'] as const
export type ReviewerStatus = (typeof reviewerStatuses)[number]

export type LumaUrl = string & { readonly __brand: 'LumaUrl' }
export type QuestionKey = string & { readonly __brand: 'QuestionKey' }

export type Attendance =
  | { kind: 'online' }
  | { kind: 'venue'; name: string }

export type PendingEvent = {
  lumaUrl: LumaUrl
  title: string
  startsAt: Date
  endsAt: Date
  attendance: Attendance
  host: string
}

export type Question = {
  questionKey: QuestionKey
  question: string
  draft: string
  final: string
}

export type EventReview = PendingEvent & {
  status: ReviewStatus
  questions: readonly Question[]
}

export type EventDetailRow = {
  luma_url: string
  title: string
  starts_at: string
  ends_at: string
  attendance: string
  venue: string | null
  host: string
  status: string
  position: number | null
  question_key: string | null
  question: string | null
  draft: string | null
  final_body: string | null
}

export function lumaUrl(raw: string): LumaUrl {
  if (!/^https:\/\/.+/.test(raw) || raw !== raw.trim()) {
    throw new Error('luma_url must be an https url')
  }
  return raw as LumaUrl
}

export function questionKey(raw: string): QuestionKey {
  if (raw.length === 0 || raw !== raw.trim()) {
    throw new Error('question_key must be non-empty and trimmed')
  }
  return raw as QuestionKey
}

export function attendance(kind: string, venue: string | null): Attendance {
  if (kind === 'online') {
    if (venue !== null) {
      throw new Error('online events have no venue')
    }
    return { kind: 'online' }
  }
  if (kind === 'venue') {
    if (venue === null || venue.trim().length === 0) {
      throw new Error('venue events need a venue')
    }
    return { kind: 'venue', name: venue }
  }
  throw new Error('attendance must be online or venue')
}

export function reviewStatus(raw: string): ReviewStatus {
  if (
    raw === 'pending' ||
    raw === 'approved' ||
    raw === 'skipped' ||
    raw === 'applied'
  ) {
    return raw
  }
  throw new Error(`unknown review status: ${raw}`)
}

export function reviewerStatus(raw: string): ReviewerStatus {
  if (raw === 'approved' || raw === 'skipped' || raw === 'applied') {
    return raw
  }
  throw new Error('pending is not a reviewer status')
}

function eventTime(raw: string): Date {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw new Error('invalid timestamp')
  }
  return date
}

const eventFields = [
  'luma_url',
  'title',
  'starts_at',
  'ends_at',
  'attendance',
  'venue',
  'host',
  'status',
] as const

export function foldEventDetail(rows: readonly EventDetailRow[]): EventReview {
  const first = rows[0]
  if (first === undefined) {
    throw new Error('event detail is empty')
  }
  for (const row of rows) {
    for (const field of eventFields) {
      if (row[field] !== first[field]) {
        throw new Error(`event detail rows disagree on ${field}`)
      }
    }
  }
  const questions: Question[] = []
  const noQuestions = rows.every((row) => row.question_key === null)
  if (!noQuestions) {
    for (const row of rows) {
      if (row.question_key === null || row.question === null || row.draft === null) {
        throw new Error('event detail question is incomplete')
      }
      questions.push({
        questionKey: questionKey(row.question_key),
        question: row.question,
        draft: row.draft,
        final: row.final_body === null ? row.draft : row.final_body,
      })
    }
  }
  return {
    lumaUrl: lumaUrl(first.luma_url),
    title: first.title,
    startsAt: eventTime(first.starts_at),
    endsAt: eventTime(first.ends_at),
    attendance: attendance(first.attendance, first.venue),
    host: first.host,
    status: reviewStatus(first.status),
    questions,
  }
}
