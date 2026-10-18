import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  attendance,
  foldEventDetail,
  lumaUrl,
  questionKey,
  reviewStatus,
  type EventDetailRow,
} from './domain.ts'

function row(overrides: Partial<EventDetailRow> = {}): EventDetailRow {
  return {
    luma_url: 'https://lu.ma/harbor-night',
    title: 'Harbor Night',
    starts_at: '2026-11-14T17:00:00.000Z',
    ends_at: '2026-11-14T21:00:00.000Z',
    attendance: 'online',
    venue: null,
    host: 'Northwind Labs',
    status: 'pending',
    position: 1,
    question_key: 'why',
    question: 'Why do you want to join?',
    draft: 'I ship small tools.',
    final_body: null,
    ...overrides,
  }
}

describe('parsers', () => {
  it('accepts an https luma url with no surrounding space', () => {
    assert.equal(lumaUrl('https://lu.ma/harbor-night'), 'https://lu.ma/harbor-night')
  })

  it('rejects a luma url that is not https or has surrounding space', () => {
    assert.throws(() => lumaUrl('http://lu.ma/harbor-night'))
    assert.throws(() => lumaUrl(' https://lu.ma/harbor-night'))
    assert.throws(() => lumaUrl('https://'))
  })

  it('accepts a trimmed question key and rejects an empty or padded one', () => {
    assert.equal(questionKey('why'), 'why')
    assert.throws(() => questionKey(''))
    assert.throws(() => questionKey(' why'))
  })

  it('builds online and venue attendance', () => {
    assert.deepEqual(attendance('online', null), { kind: 'online' })
    assert.deepEqual(attendance('venue', 'Studio 4'), { kind: 'venue', name: 'Studio 4' })
    assert.throws(() => attendance('online', 'Studio 4'))
    assert.throws(() => attendance('venue', null))
    assert.throws(() => attendance('venue', '   '))
    assert.throws(() => attendance('hybrid', null))
  })

  it('accepts the four review statuses and rejects anything else', () => {
    assert.equal(reviewStatus('pending'), 'pending')
    assert.equal(reviewStatus('approved'), 'approved')
    assert.equal(reviewStatus('skipped'), 'skipped')
    assert.equal(reviewStatus('applied'), 'applied')
    assert.throws(() => reviewStatus('archived'))
  })
})

describe('foldEventDetail', () => {
  it('uses a saved final', () => {
    const folded = foldEventDetail([row({ final_body: 'My edit' })])
    assert.equal(folded.questions[0]?.final, 'My edit')
    assert.equal(folded.questions[0]?.draft, 'I ship small tools.')
  })

  it('falls back to the draft when the saved final is null', () => {
    const folded = foldEventDetail([row({ final_body: null })])
    assert.equal(folded.questions[0]?.final, 'I ship small tools.')
  })

  it('keeps an empty-string saved final', () => {
    const folded = foldEventDetail([row({ final_body: '' })])
    assert.equal(folded.questions[0]?.final, '')
  })

  it('throws when two rows disagree on the title', () => {
    assert.throws(
      () => foldEventDetail([row(), row({ title: 'Other Night', position: 2, question_key: 'stack' })]),
      /disagree on title/,
    )
  })
})
