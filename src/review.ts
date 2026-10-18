import { db } from './db.ts'
import {
  attendance,
  foldEventDetail,
  lumaUrl,
  type EventDetailRow,
  type EventReview,
  type LumaUrl,
  type PendingEvent,
  type QuestionKey,
  type ReviewerStatus,
} from './domain.ts'

export async function listPending(): Promise<PendingEvent[]> {
  const { data, error } = await db
    .from('pending_event')
    .select('luma_url, title, starts_at, ends_at, attendance, venue, host')
    .order('starts_at', { ascending: true })
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => {
    const parsed = pendingRow(row)
    return {
      lumaUrl: lumaUrl(parsed.luma_url),
      title: parsed.title,
      startsAt: eventTime(parsed.starts_at),
      endsAt: eventTime(parsed.ends_at),
      attendance: attendance(parsed.attendance, parsed.venue),
      host: parsed.host,
    }
  })
}

export async function openEvent(url: LumaUrl): Promise<EventReview> {
  const { data, error } = await db
    .from('event_detail')
    .select(
      'luma_url, title, starts_at, ends_at, attendance, venue, host, status, position, question_key, question, draft, final_body',
    )
    .eq('luma_url', url)
    .order('position', { ascending: true, nullsFirst: true })
  if (error) {
    throw error
  }
  return foldEventDetail((data ?? []).map(detailRow))
}

export async function saveFinal(
  url: LumaUrl,
  key: QuestionKey,
  final: string,
): Promise<void> {
  const { error } = await db.rpc('save_final', {
    p_luma_url: url,
    p_question_key: key,
    p_body: final,
  })
  if (error) {
    throw error
  }
}

export async function setStatus(url: LumaUrl, status: ReviewerStatus): Promise<void> {
  const { error } = await db.rpc('set_review_status', {
    p_luma_url: url,
    p_status: status,
  })
  if (error) {
    throw error
  }
}

function eventTime(raw: string): Date {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw new Error('invalid timestamp')
  }
  return date
}

function pendingRow(value: unknown): {
  luma_url: string
  title: string
  starts_at: string
  ends_at: string
  attendance: string
  venue: string | null
  host: string
} {
  const row = record(value, 'pending_event')
  return {
    luma_url: requiredString(row, 'luma_url'),
    title: requiredString(row, 'title'),
    starts_at: requiredString(row, 'starts_at'),
    ends_at: requiredString(row, 'ends_at'),
    attendance: requiredString(row, 'attendance'),
    venue: optionalString(row, 'venue'),
    host: requiredString(row, 'host'),
  }
}

function detailRow(value: unknown): EventDetailRow {
  const row = record(value, 'event_detail')
  return {
    luma_url: requiredString(row, 'luma_url'),
    title: requiredString(row, 'title'),
    starts_at: requiredString(row, 'starts_at'),
    ends_at: requiredString(row, 'ends_at'),
    attendance: requiredString(row, 'attendance'),
    venue: optionalString(row, 'venue'),
    host: requiredString(row, 'host'),
    status: requiredString(row, 'status'),
    position: optionalNumber(row, 'position'),
    question_key: optionalString(row, 'question_key'),
    question: optionalString(row, 'question'),
    draft: optionalString(row, 'draft'),
    final_body: optionalString(row, 'final_body'),
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${label} row is not an object`)
  }
  return value as Record<string, unknown>
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string`)
  }
  return value
}

function optionalString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string or null`)
  }
  return value
}

function optionalNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key]
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value !== 'number') {
    throw new Error(`${key} must be a number or null`)
  }
  return value
}
