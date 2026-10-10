-- ShortPity: per-user projects + video storage
-- Run once in Supabase Dashboard > SQL Editor (or `supabase db push`).

-- ---------- projects table ----------
create table if not exists public.projects (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  source      jsonb not null,
  duration    double precision not null default 0,
  energy      jsonb not null default '[]'::jsonb,
  segments    jsonb not null default '[]'::jsonb,
  template_id text not null,
  -- Storage object path in the "videos" bucket (null for YouTube projects)
  video_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "projects_insert_own" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "projects_update_own" on public.projects
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "projects_delete_own" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- videos bucket (private) ----------
insert into storage.buckets (id, name, public)
values ('videos', 'videos', false)
on conflict (id) do nothing;

-- Objects are stored as "<user_id>/<project_id>"; users can only touch their own folder
drop policy if exists "videos_select_own" on storage.objects;
drop policy if exists "videos_insert_own" on storage.objects;
drop policy if exists "videos_update_own" on storage.objects;
drop policy if exists "videos_delete_own" on storage.objects;

create policy "videos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "videos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "videos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "videos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
