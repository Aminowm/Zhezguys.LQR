-- Zhezguys LQR Lab — Supabase schema
-- Run this once in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- Row Level Security guarantees that a team can only read and change its own work.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  join_code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  joined_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  team_id uuid primary key references public.teams(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.teams enable row level security;
alter table public.members enable row level security;
alter table public.workspaces enable row level security;

-- The caller's team (security definer so policies can use it without recursion).
create or replace function public.my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.members where user_id = auth.uid()
$$;

drop policy if exists "team members read their team" on public.teams;
create policy "team members read their team" on public.teams
  for select to authenticated using (id = public.my_team_id());

drop policy if exists "team members read teammates" on public.members;
create policy "team members read teammates" on public.members
  for select to authenticated using (team_id = public.my_team_id());

drop policy if exists "team reads its workspace" on public.workspaces;
create policy "team reads its workspace" on public.workspaces
  for select to authenticated using (team_id = public.my_team_id());

drop policy if exists "team creates its workspace" on public.workspaces;
create policy "team creates its workspace" on public.workspaces
  for insert to authenticated with check (team_id = public.my_team_id());

drop policy if exists "team updates its workspace" on public.workspaces;
create policy "team updates its workspace" on public.workspaces
  for update to authenticated
  using (team_id = public.my_team_id())
  with check (team_id = public.my_team_id());

-- No insert/update/delete policies on teams/members: changes only happen
-- through the functions below.

create or replace function public.zg_new_code() returns text
language plpgsql as $$
declare
  abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(abc, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.teams where join_code = code);
  end loop;
  return code;
end $$;

create or replace function public.create_team(team_name text, first_name text, last_name text) returns json
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'already_in_team'; end if;
  if char_length(trim(coalesce(team_name, ''))) = 0 then raise exception 'team_required'; end if;
  insert into public.teams (name, join_code, created_by)
    values (trim(team_name), public.zg_new_code(), auth.uid()) returning * into t;
  insert into public.members (user_id, team_id, first_name, last_name, email)
    values (auth.uid(), t.id, trim(first_name), trim(last_name), (select email from auth.users where id = auth.uid()));
  return json_build_object('id', t.id, 'name', t.name, 'join_code', t.join_code);
end $$;

create or replace function public.join_team(code text, first_name text, last_name text) returns json
language plpgsql security definer set search_path = public as $$
declare
  t public.teams;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'already_in_team'; end if;
  select * into t from public.teams where join_code = upper(trim(code));
  if t.id is null then raise exception 'bad_code'; end if;
  insert into public.members (user_id, team_id, first_name, last_name, email)
    values (auth.uid(), t.id, trim(first_name), trim(last_name), (select email from auth.users where id = auth.uid()));
  return json_build_object('id', t.id, 'name', t.name, 'join_code', t.join_code);
end $$;

-- Lets the sign-up form show the team name for a join code (name only).
create or replace function public.lookup_team(code text) returns text
language sql stable security definer set search_path = public as $$
  select name from public.teams where join_code = upper(trim(code))
$$;

revoke all on function public.create_team(text, text, text) from public, anon;
revoke all on function public.join_team(text, text, text) from public, anon;
grant execute on function public.create_team(text, text, text) to authenticated;
grant execute on function public.join_team(text, text, text) to authenticated;
grant execute on function public.lookup_team(text) to anon, authenticated;
grant execute on function public.my_team_id() to authenticated;
