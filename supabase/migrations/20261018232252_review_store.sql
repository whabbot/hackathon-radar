create schema if not exists radar;

revoke all on schema radar from public;
grant usage on schema radar to authenticated, service_role;

create type public.review_status as enum (
  'pending',
  'approved',
  'skipped',
  'applied'
);

create table radar.events (
  luma_url text primary key,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  attendance text not null,
  venue text,
  host text not null,
  constraint events_url check (luma_url ~ '^https://.+'),
  constraint events_title check (length(trim(title)) > 0),
  constraint events_host check (length(trim(host)) > 0),
  constraint events_times check (ends_at >= starts_at),
  constraint events_attendance check (attendance in ('online', 'venue')),
  constraint events_place check (
    (attendance = 'online' and venue is null)
    or (
      attendance = 'venue'
      and venue is not null
      and length(trim(venue)) > 0
    )
  )
);

create table radar.draft_answers (
  luma_url text not null references radar.events (luma_url) on delete cascade,
  question_key text not null,
  position integer not null,
  question text not null,
  draft text not null,
  primary key (luma_url, question_key),
  constraint drafts_key check (
    length(trim(question_key)) > 0
    and question_key = trim(question_key)
  ),
  constraint drafts_question check (length(trim(question)) > 0),
  constraint drafts_position check (position > 0)
);

create table radar.reviews (
  luma_url text primary key references radar.events (luma_url) on delete cascade,
  status public.review_status not null default 'pending'
);

create table radar.final_answers (
  luma_url text not null references radar.events (luma_url) on delete cascade,
  question_key text not null,
  body text not null,
  primary key (luma_url, question_key)
);

create function radar.insert_pending_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into radar.reviews (luma_url, status)
  values (new.luma_url, 'pending');
  return new;
end;
$$;

create trigger events_insert_pending_review
after insert on radar.events
for each row
execute function radar.insert_pending_review();

create view public.pending_event
with (security_invoker = true) as
select
  e.luma_url,
  e.title,
  e.starts_at,
  e.ends_at,
  e.attendance,
  e.venue,
  e.host
from radar.events as e
join radar.reviews as r on r.luma_url = e.luma_url
where r.status = 'pending';

create view public.event_detail
with (security_invoker = true) as
select
  e.luma_url,
  e.title,
  e.starts_at,
  e.ends_at,
  e.attendance,
  e.venue,
  e.host,
  r.status,
  d.position,
  d.question_key,
  d.question,
  d.draft,
  f.body as final_body
from radar.events as e
join radar.reviews as r on r.luma_url = e.luma_url
left join radar.draft_answers as d on d.luma_url = e.luma_url
left join radar.final_answers as f
  on f.luma_url = d.luma_url
 and f.question_key = d.question_key;

create function public.ingest_luma_event(
  p_luma_url text,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_attendance text,
  p_venue text,
  p_host text,
  p_questions jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_venue text := nullif(trim(coalesce(p_venue, '')), '');
begin
  if p_luma_url is null or p_luma_url !~ '^https://.+' then
    raise exception 'ingest: luma_url must be an https url';
  end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'ingest: title is required';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at < p_starts_at then
    raise exception 'ingest: ends_at must be at or after starts_at';
  end if;
  if nullif(trim(coalesce(p_host, '')), '') is null then
    raise exception 'ingest: host is required';
  end if;
  if p_attendance = 'online' then
    if v_venue is not null then
      raise exception 'ingest: online events have no venue';
    end if;
  elsif p_attendance = 'venue' then
    if v_venue is null then
      raise exception 'ingest: venue events need a venue';
    end if;
  else
    raise exception 'ingest: attendance must be online or venue';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'ingest: questions must be a json array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_questions) as q(elem)
    where jsonb_typeof(q.elem) = 'object'
      and (
        q.elem ? 'final'
        or q.elem ? 'final_answer'
        or q.elem ? 'status'
      )
  ) then
    raise exception 'ingest: question must not include final, final_answer, or status';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_questions) as q(elem)
    where jsonb_typeof(q.elem) <> 'object'
       or nullif(trim(coalesce(q.elem->>'question_key', '')), '') is null
       or nullif(trim(coalesce(q.elem->>'question', '')), '') is null
       or q.elem->>'draft' is null
       or q.elem->>'question_key' <> trim(q.elem->>'question_key')
  ) then
    raise exception 'ingest: each question needs a trimmed question_key, a question, and a draft';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_questions) as q(elem)
    group by q.elem->>'question_key'
    having count(*) > 1
  ) then
    raise exception 'ingest: duplicate question_key';
  end if;

  insert into radar.events (
    luma_url, title, starts_at, ends_at, attendance, venue, host
  ) values (
    p_luma_url,
    trim(p_title),
    p_starts_at,
    p_ends_at,
    p_attendance,
    v_venue,
    trim(p_host)
  )
  on conflict (luma_url) do update
  set
    title = excluded.title,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    attendance = excluded.attendance,
    venue = excluded.venue,
    host = excluded.host;

  delete from radar.draft_answers as d
  where d.luma_url = p_luma_url
    and not exists (
      select 1
      from jsonb_array_elements(p_questions) as q(elem)
      where q.elem->>'question_key' = d.question_key
    );

  insert into radar.draft_answers (
    luma_url, question_key, position, question, draft
  )
  select
    p_luma_url,
    q.elem->>'question_key',
    q.ord::integer,
    trim(q.elem->>'question'),
    q.elem->>'draft'
  from jsonb_array_elements(p_questions) with ordinality as q(elem, ord)
  on conflict (luma_url, question_key) do update
  set
    position = excluded.position,
    question = excluded.question,
    draft = excluded.draft;
end;
$$;

create function public.set_review_status(
  p_luma_url text,
  p_status public.review_status
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_status = 'pending' then
    raise exception 'set_review_status: pending is not a reviewer status';
  end if;
  update radar.reviews
  set status = p_status
  where luma_url = p_luma_url;
  if not found then
    raise exception 'set_review_status: unknown event';
  end if;
end;
$$;

create function public.save_final(
  p_luma_url text,
  p_question_key text,
  p_body text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_body is null then
    raise exception 'save_final: body is required';
  end if;
  insert into radar.final_answers (luma_url, question_key, body)
  values (p_luma_url, p_question_key, p_body)
  on conflict (luma_url, question_key) do update
  set body = excluded.body;
end;
$$;

alter table radar.events enable row level security;
alter table radar.draft_answers enable row level security;
alter table radar.reviews enable row level security;
alter table radar.final_answers enable row level security;

alter table radar.events force row level security;
alter table radar.draft_answers force row level security;
alter table radar.reviews force row level security;
alter table radar.final_answers force row level security;

revoke all on table radar.events from public, anon, authenticated, service_role;
revoke all on table radar.draft_answers from public, anon, authenticated, service_role;
revoke all on table radar.reviews from public, anon, authenticated, service_role;
revoke all on table radar.final_answers from public, anon, authenticated, service_role;

grant select on table radar.events to authenticated, service_role;
grant insert (
  luma_url, title, starts_at, ends_at, attendance, venue, host
) on table radar.events to service_role;
grant update (
  title, starts_at, ends_at, attendance, venue, host
) on table radar.events to service_role;

grant select on table radar.draft_answers to authenticated, service_role;
grant insert (
  luma_url, question_key, position, question, draft
) on table radar.draft_answers to service_role;
grant update (position, question, draft) on table radar.draft_answers to service_role;
grant delete on table radar.draft_answers to service_role;

grant select on table radar.reviews to authenticated;
grant update (status) on table radar.reviews to authenticated;

grant select on table radar.final_answers to authenticated;
grant insert (luma_url, question_key, body) on table radar.final_answers to authenticated;
grant update (body) on table radar.final_answers to authenticated;

revoke all on table public.pending_event from public, anon, authenticated, service_role;
revoke all on table public.event_detail from public, anon, authenticated, service_role;
grant select on table public.pending_event to authenticated;
grant select on table public.event_detail to authenticated;

revoke all on function radar.insert_pending_review()
  from public, anon, authenticated, service_role;
grant execute on function radar.insert_pending_review() to service_role;

revoke all on function public.ingest_luma_event(
  text, text, timestamptz, timestamptz, text, text, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.ingest_luma_event(
  text, text, timestamptz, timestamptz, text, text, text, jsonb
) to service_role;

revoke all on function public.set_review_status(text, public.review_status)
  from public, anon, authenticated, service_role;
grant execute on function public.set_review_status(text, public.review_status)
  to authenticated;

revoke all on function public.save_final(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_final(text, text, text) to authenticated;

create policy events_select
on radar.events
for select
to authenticated
using (true);

create policy drafts_select
on radar.draft_answers
for select
to authenticated
using (true);

create policy reviews_select
on radar.reviews
for select
to authenticated
using (true);

create policy reviews_update
on radar.reviews
for update
to authenticated
using (true)
with check (status in ('approved', 'skipped', 'applied'));

create policy finals_select
on radar.final_answers
for select
to authenticated
using (true);

create policy finals_insert
on radar.final_answers
for insert
to authenticated
with check (
  exists (
    select 1
    from radar.draft_answers as d
    where d.luma_url = luma_url
      and d.question_key = question_key
  )
);

create policy finals_update
on radar.final_answers
for update
to authenticated
using (true)
with check (true);
