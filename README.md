# Hackathon radar

A local review page for hackathon events a bot has already ingested. A reviewer signs in, reads the pending queue, edits a final answer, and marks the event approved, skipped, or applied.

This repo does not scrape Luma, read calendars, generate answers, or submit applications.

## Bot contract

The bot calls `public.ingest_luma_event` with the service role. A second call refreshes the event facts and the draft set. The bot cannot change `radar.reviews.status` or a saved `radar.final_answers.body`.

```sql
select public.ingest_luma_event(
  'https://lu.ma/harbor-night',
  'Harbor Night',
  '2026-11-14T17:00:00Z',
  '2026-11-14T21:00:00Z',
  'online',
  null,
  'Northwind Labs',
  jsonb_build_array(
    jsonb_build_object(
      'question_key', 'why',
      'question', 'Why do you want to join?',
      'draft', 'I ship small tools.'
    ),
    jsonb_build_object(
      'question_key', 'stack',
      'question', 'What will you build?',
      'draft', 'A review queue.'
    )
  )
);
```

## Local review

Start the local stack:

```bash
supabase start
```

Copy the API URL and the anon key from `supabase status` into `.env`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

The anon key printed by the CLI is local-only.

```bash
npm install
npm run dev
```

Sign in as `wail@localhost` / `local-review`.
