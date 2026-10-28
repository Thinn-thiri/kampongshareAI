-- KampongShare AI — saved AI translations of messages
--   * each message is translated at most once per reader language (en, zh, ms)
--   * readers can see a translation only if they can see the message itself
--     (same rules: the two sides, minus anything they deleted; admins for reported ones)
--   * ONLY the server (Netlify Function with the service role key) can save
--     translations, so nobody can plant a fake "translation" of someone's message
--   * translations are deleted together with their message
-- Paste into Supabase → SQL Editor → Run (once), after the messaging files.

begin;

create table public.message_translations (
  message_id      uuid not null references public.messages (id) on delete cascade,
  target_lang     text not null check (target_lang in ('en', 'zh', 'ms')),
  detected_lang   text not null check (detected_lang in ('en', 'zh', 'ms', 'other')),
  translated_text text check (length(translated_text) <= 3000),  -- null = already in target language
  created_at      timestamptz not null default now(),
  primary key (message_id, target_lang)
);

-- Supabase gives new tables full access by default; readers only get SELECT.
revoke all on public.message_translations from anon, authenticated;
grant select on public.message_translations to authenticated;

alter table public.message_translations enable row level security;

-- visible exactly when the message itself is visible to you (the messages rules apply here)
create policy "See translations of messages you can see" on public.message_translations
  for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));

commit;