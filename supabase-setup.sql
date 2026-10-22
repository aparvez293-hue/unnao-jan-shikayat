-- Unnao Jan Shikayat: Supabase SQL setup
-- Run this in Supabase Dashboard > SQL Editor.
-- IMPORTANT: Do not enable public sign-ups. Create only your own admin user
-- in Authentication > Users. The frontend never needs a service_role key.

create extension if not exists pgcrypto;

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  tracking_code text not null unique default (
    'UJS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  ),
  name text not null check (char_length(name) between 2 and 100),
  phone text not null check (char_length(phone) between 10 and 16),
  category text not null check (char_length(category) between 2 and 100),
  locality text not null check (char_length(locality) between 2 and 150),
  location text not null default '' check (char_length(location) <= 250),
  details text not null check (char_length(details) between 10 and 3000),
  status text not null default 'Received'
    check (status in ('Received','Reviewed','Forwarded','In Progress','Resolved','Rejected')),
  created_at timestamptz not null default now()
);

alter table public.complaints enable row level security;

-- Public visitors submit through a narrowly scoped function. They cannot read
-- the private table, including the generated tracking code via table SELECT.
drop policy if exists "Public can submit complaints" on public.complaints;
create policy "Public can submit complaints"
on public.complaints for insert to anon, authenticated
with check (
  status = 'Received'
  and char_length(name) between 2 and 100
  and char_length(phone) between 10 and 16
  and char_length(details) between 10 and 3000
);

create or replace function public.submit_complaint(
  p_name text,
  p_phone text,
  p_category text,
  p_locality text,
  p_location text,
  p_details text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if p_name is null or char_length(trim(p_name)) not between 2 and 100
     or p_phone is null or char_length(trim(p_phone)) not between 10 and 16
     or p_category is null or char_length(trim(p_category)) not between 2 and 100
     or p_locality is null or char_length(trim(p_locality)) not between 2 and 150
     or char_length(coalesce(p_location, '')) > 250
     or p_details is null or char_length(trim(p_details)) not between 10 and 3000 then
    raise exception 'Please check the complaint fields.';
  end if;

  insert into public.complaints
    (name, phone, category, locality, location, details, status)
  values
    (trim(p_name), trim(p_phone), trim(p_category), trim(p_locality),
     coalesce(trim(p_location), ''), trim(p_details), 'Received')
  returning tracking_code into v_code;

  return v_code;
end;
$$;

revoke all on function public.submit_complaint(text,text,text,text,text,text) from public;
grant execute on function public.submit_complaint(text,text,text,text,text,text) to anon, authenticated;

-- Only signed-in users can read/update. Keep public sign-up disabled and
-- create only the portal administrator in Supabase Authentication > Users.
drop policy if exists "Admin can read complaints" on public.complaints;
create policy "Admin can read complaints"
on public.complaints for select to authenticated
using (auth.uid() is not null);

drop policy if exists "Admin can update complaints" on public.complaints;
create policy "Admin can update complaints"
on public.complaints for update to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

-- Limit normal browser roles to only required operations/columns.
revoke all on public.complaints from anon, authenticated;
grant select (id, tracking_code, name, phone, category, locality, location, details, status, created_at)
  on public.complaints to authenticated;
grant update (status) on public.complaints to authenticated;

-- NOTE: This basic policy assumes there is exactly one administrator and
-- public account registration remains disabled. For a multi-admin deployment,
-- add an explicit admin allowlist and restrict policies to those user IDs.
-- Public complaint status lookup is intentionally not enabled in this starter.
-- Add a Supabase Edge Function that returns ONLY status for a tracking code
-- before enabling public tracking; never expose the full complaints table.
