-- LivingLabs prototype handoff storage for Supabase.
-- Run this in Supabase Dashboard > SQL Editor.
-- This schema is intentionally small: each tool stores the original payload as JSONB,
-- while common columns make filtering by region/status easy.

create table if not exists public.platform_handoffs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (
    kind in (
      'priority_to_lead',
      'lead_to_responsible',
      'responsible_to_lead'
    )
  ),
  region_code text not null,
  region_name text,
  package_id text,
  source_package_id text,
  status text not null default 'requested' check (
    status in (
      'requested',
      'reviewing',
      'risk_done',
      'completed',
      'recalled',
      'sent',
      'archived'
    )
  ),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, region_code, package_id)
);

create index if not exists platform_handoffs_region_idx
  on public.platform_handoffs (kind, region_code, status, updated_at desc);

create index if not exists platform_handoffs_package_idx
  on public.platform_handoffs (package_id);

create or replace function public.set_platform_handoffs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_platform_handoffs_updated_at
  on public.platform_handoffs;

create trigger set_platform_handoffs_updated_at
before update on public.platform_handoffs
for each row
execute function public.set_platform_handoffs_updated_at();

alter table public.platform_handoffs enable row level security;

-- Prototype/demo policy.
-- This allows the public browser key to read and write handoff data.
-- Tighten this later when login/department authorization is added.
drop policy if exists "demo read platform handoffs"
  on public.platform_handoffs;
drop policy if exists "demo insert platform handoffs"
  on public.platform_handoffs;
drop policy if exists "demo update platform handoffs"
  on public.platform_handoffs;
drop policy if exists "demo delete platform handoffs"
  on public.platform_handoffs;

create policy "demo read platform handoffs"
on public.platform_handoffs
for select
using (true);

create policy "demo insert platform handoffs"
on public.platform_handoffs
for insert
with check (true);

create policy "demo update platform handoffs"
on public.platform_handoffs
for update
using (true)
with check (true);

create policy "demo delete platform handoffs"
on public.platform_handoffs
for delete
using (true);
