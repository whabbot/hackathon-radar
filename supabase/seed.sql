insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'a11ce000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'wail@localhost',
  extensions.crypt('local-review', extensions.gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into auth.identities (
  id,
  user_id,
  provider,
  provider_id,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
) values (
  'a11ce000-0000-4000-8000-000000000002',
  'a11ce000-0000-4000-8000-000000000001',
  'email',
  'a11ce000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'sub', 'a11ce000-0000-4000-8000-000000000001',
    'email', 'wail@localhost',
    'email_verified', true
  ),
  now(),
  now(),
  now()
);

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

select public.ingest_luma_event(
  'https://lu.ma/studio-floor',
  'Studio Floor',
  '2026-11-21T16:00:00Z',
  '2026-11-21T23:00:00Z',
  'venue',
  'Studio 4',
  'Calendar: Wail',
  jsonb_build_array(
    jsonb_build_object(
      'question_key', 'prompt',
      'question', 'What problem will you tackle?',
      'draft', 'A quieter queue.'
    ),
    jsonb_build_object(
      'question_key', 'team',
      'question', 'Who is on your team?',
      'draft', 'Just me.'
    )
  )
);

select public.ingest_luma_event(
  'https://lu.ma/applied-weekend',
  'Applied Weekend',
  '2026-12-05T15:00:00Z',
  '2026-12-06T15:00:00Z',
  'venue',
  'Pier 9',
  'Dock Club',
  jsonb_build_array(
    jsonb_build_object(
      'question_key', 'why',
      'question', 'Why this weekend?',
      'draft', 'I can stay both days.'
    ),
    jsonb_build_object(
      'question_key', 'build',
      'question', 'What will you ship?',
      'draft', 'The review page.'
    )
  )
);

update radar.reviews
set status = 'applied'
where luma_url = 'https://lu.ma/applied-weekend';

insert into radar.final_answers (luma_url, question_key, body)
values ('https://lu.ma/applied-weekend', 'why', 'My edit stays.');
