-- LivingLabs normalized workflow schema.
-- Source: livinglab_data_structure_v2.xlsx
--
-- Geometry is stored as GeoJSON jsonb in this first migration because the
-- current frontend already consumes GeoJSON-like objects and GitHub Pages can
-- read/write jsonb through Supabase REST without PostGIS client helpers.
-- If PostGIS is enabled later, generated geometry columns or database views can
-- be added without changing the browser data contract.

create extension if not exists pgcrypto;

create or replace function public.set_livinglab_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.regions (
  region_code text primary key,
  region_name text not null,
  sido_name text,
  sigungu_name text,
  geometry jsonb,
  default_center jsonb,
  default_zoom integer,
  vworld_admin_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.priority_area_sets (
  id uuid primary key default gen_random_uuid(),
  region_code text not null references public.regions(region_code),
  set_name text not null,
  hazard_type text not null,
  scenario_name text,
  analysis_version text,
  analysis_conditions jsonb not null default '{}'::jsonb,
  source_job_id text,
  status text not null default 'draft',
  created_by_tool text not null default 'priority_area_tool',
  created_by_user text,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  submitted_at timestamptz,
  description text,
  constraint priority_area_sets_status_check check (status in ('draft', 'requested', 'in_review', 'selected', 'archived', 'closed'))
);

create table if not exists public.priority_area_options (
  id uuid primary key default gen_random_uuid(),
  area_set_id uuid not null references public.priority_area_sets(id) on delete cascade,
  option_no integer not null,
  option_name text not null,
  rank integer,
  summary text,
  risk_score numeric,
  h_score numeric,
  e_score numeric,
  v_score numeric,
  hotspot_threshold text,
  geometry jsonb not null default '{}'::jsonb,
  centroid jsonb,
  bbox jsonb,
  attributes jsonb,
  is_recommended boolean,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint priority_area_options_status_check check (status in ('draft', 'requested', 'under_review', 'selected', 'not_selected', 'archived'))
);

create table if not exists public.parcel_candidates (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.priority_area_options(id) on delete cascade,
  rank integer not null,
  candidate_name text,
  risk_score numeric,
  h_score numeric,
  e_score numeric,
  v_score numeric,
  area_m2 numeric,
  geometry jsonb not null default '{}'::jsonb,
  centroid jsonb,
  parcel_count integer,
  address_summary text,
  attributes jsonb,
  selected boolean,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint parcel_candidates_status_check check (status in ('draft', 'requested', 'under_review', 'selected', 'not_selected', 'archived'))
);

create table if not exists public.candidate_parcels (
  id uuid primary key default gen_random_uuid(),
  parcel_candidate_id uuid not null references public.parcel_candidates(id) on delete cascade,
  pnu text not null,
  jibun_address text,
  road_address text,
  land_category text,
  area_m2 numeric,
  owner_type text,
  land_use text,
  geometry jsonb not null default '{}'::jsonb,
  attributes jsonb,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (parcel_candidate_id, pnu)
);

create table if not exists public.selected_priority_areas (
  id uuid primary key default gen_random_uuid(),
  area_set_id uuid not null references public.priority_area_sets(id),
  option_id uuid not null references public.priority_area_options(id),
  region_code text not null references public.regions(region_code),
  selected_name text not null,
  selection_reason text,
  memo text,
  selected_by_tool text not null default 'lead_department_tool',
  selected_by_role text,
  selection_status text not null default 'selected',
  geometry_snapshot jsonb,
  score_snapshot jsonb,
  selected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint selected_priority_areas_status_check check (selection_status in ('selected', 'under_project_review', 'confirmed', 'archived'))
);

create table if not exists public.adaptation_projects (
  id uuid primary key default gen_random_uuid(),
  region_code text not null references public.regions(region_code),
  sector text not null,
  hazard_type text not null,
  project_type text not null,
  project_name text not null,
  description text,
  default_geometry_type text not null default 'point',
  target_quantity numeric,
  target_unit text,
  effect_metric text,
  default_effect_params jsonb,
  status text not null default 'draft',
  created_by_tool text not null default 'lead_department_tool',
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint adaptation_projects_geometry_type_check check (default_geometry_type in ('point', 'line', 'polygon', 'none')),
  constraint adaptation_projects_status_check check (status in ('draft', 'active', 'archived'))
);

create table if not exists public.adaptation_placements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.adaptation_projects(id),
  selected_area_id uuid references public.selected_priority_areas(id),
  area_set_id uuid references public.priority_area_sets(id),
  option_id uuid references public.priority_area_options(id),
  parcel_candidate_id uuid references public.parcel_candidates(id),
  geometry jsonb,
  geometry_type text not null default 'point',
  quantity numeric,
  unit text,
  proposed_by_tool text not null,
  version_no integer not null default 1,
  parent_placement_id uuid references public.adaptation_placements(id),
  status text not null default 'draft',
  effect_summary jsonb,
  implementation_score numeric,
  memo text,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint adaptation_placements_geometry_type_check check (geometry_type in ('point', 'line', 'polygon', 'none')),
  constraint adaptation_placements_status_check check (status in ('draft', 'proposed_by_lead', 'sent_to_responsible', 'modified_by_responsible', 'returned_to_lead', 'accepted', 'rejected', 'archived'))
);

create table if not exists public.handoff_requests (
  id uuid primary key default gen_random_uuid(),
  parent_handoff_id uuid references public.handoff_requests(id),
  request_type text not null,
  from_tool text not null,
  to_tool text not null,
  region_code text not null references public.regions(region_code),
  area_set_id uuid references public.priority_area_sets(id),
  selected_area_id uuid references public.selected_priority_areas(id),
  project_review_package_id uuid,
  title text not null,
  memo text,
  status text not null default 'requested',
  payload_summary jsonb,
  created_by_tool text not null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz,
  constraint handoff_requests_type_check check (request_type in ('priority_area_review', 'project_review', 'revision_reply')),
  constraint handoff_requests_status_check check (status in ('requested', 'opened', 'in_review', 'returned', 'accepted', 'rejected', 'closed'))
);

create table if not exists public.project_review_packages (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.handoff_requests(id) on delete cascade,
  region_code text not null references public.regions(region_code),
  selected_area_id uuid not null references public.selected_priority_areas(id),
  area_set_id uuid references public.priority_area_sets(id),
  option_id uuid references public.priority_area_options(id),
  title text not null,
  memo text,
  status text not null default 'draft',
  from_tool text not null,
  to_tool text not null,
  summary_payload jsonb,
  created_by_tool text not null,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz,
  constraint project_review_packages_status_check check (status in ('draft', 'requested', 'opened', 'in_review', 'returned', 'accepted', 'closed'))
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'handoff_requests_project_review_package_fk'
  ) then
    alter table public.handoff_requests
      add constraint handoff_requests_project_review_package_fk
      foreign key (project_review_package_id) references public.project_review_packages(id) on delete set null;
  end if;
end $$;

create table if not exists public.project_review_items (
  id uuid primary key default gen_random_uuid(),
  review_package_id uuid not null references public.project_review_packages(id) on delete cascade,
  item_type text not null,
  project_id uuid references public.adaptation_projects(id),
  placement_id uuid references public.adaptation_placements(id),
  item_order integer,
  memo text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint project_review_items_type_check check (item_type in ('project', 'placement', 'evaluation_summary', 'memo')),
  constraint project_review_items_status_check check (status in ('draft', 'requested', 'in_review', 'returned', 'accepted', 'rejected', 'closed'))
);

create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.handoff_requests(id) on delete cascade,
  project_review_package_id uuid references public.project_review_packages(id),
  actor_tool text not null,
  actor_role text,
  action text not null,
  memo text,
  payload_snapshot jsonb,
  related_placement_id uuid references public.adaptation_placements(id),
  created_at timestamptz not null default now()
);

create table if not exists public.evaluation_criteria_sets (
  id uuid primary key default gen_random_uuid(),
  criteria_name text not null,
  target_type text not null,
  hazard_type text,
  sector text,
  version text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.evaluation_indicators (
  id uuid primary key default gen_random_uuid(),
  criteria_set_id uuid not null references public.evaluation_criteria_sets(id) on delete cascade,
  indicator_code text not null,
  category text,
  indicator_name text not null,
  description text,
  weight numeric not null default 1,
  unit text,
  direction text not null default 'higher_is_worse',
  normalization_method text,
  score_min numeric,
  score_max numeric,
  sort_order integer,
  is_active boolean not null default true,
  constraint evaluation_indicators_direction_check check (direction in ('higher_is_better', 'higher_is_worse', 'neutral'))
);

create table if not exists public.evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  criteria_set_id uuid not null references public.evaluation_criteria_sets(id),
  target_type text not null,
  run_name text,
  run_conditions jsonb,
  evaluated_by_tool text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  evaluation_run_id uuid not null references public.evaluation_runs(id) on delete cascade,
  indicator_id uuid not null references public.evaluation_indicators(id),
  target_type text not null,
  target_id uuid not null,
  area_set_id uuid references public.priority_area_sets(id),
  option_id uuid references public.priority_area_options(id),
  parcel_candidate_id uuid references public.parcel_candidates(id),
  placement_id uuid references public.adaptation_placements(id),
  raw_value jsonb,
  normalized_score numeric,
  weighted_score numeric,
  score_unit text,
  created_at timestamptz not null default now()
);

insert into public.regions (region_code, region_name, sido_name, sigungu_name, default_center, default_zoom, vworld_admin_code)
values ('41110', '경기도 수원시', '경기도', '수원시', '{"lat": 37.2636, "lng": 127.0286}'::jsonb, 11, '41110')
on conflict (region_code) do update
set region_name = excluded.region_name,
    sido_name = excluded.sido_name,
    sigungu_name = excluded.sigungu_name,
    default_center = excluded.default_center,
    default_zoom = excluded.default_zoom,
    vworld_admin_code = excluded.vworld_admin_code;

create index if not exists idx_priority_area_sets_region_status on public.priority_area_sets(region_code, status);
create index if not exists idx_priority_area_options_set_status on public.priority_area_options(area_set_id, status);
create index if not exists idx_parcel_candidates_option_rank on public.parcel_candidates(option_id, rank);
create index if not exists idx_candidate_parcels_candidate on public.candidate_parcels(parcel_candidate_id);
create index if not exists idx_selected_priority_areas_region_status on public.selected_priority_areas(region_code, selection_status);
create index if not exists idx_adaptation_projects_region on public.adaptation_projects(region_code, sector, hazard_type);
create index if not exists idx_adaptation_placements_selected_area on public.adaptation_placements(selected_area_id, status);
create index if not exists idx_handoff_requests_to_tool on public.handoff_requests(to_tool, region_code, status);
create index if not exists idx_project_review_packages_region_status on public.project_review_packages(region_code, status);
create index if not exists idx_review_events_handoff on public.review_events(handoff_id, created_at);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'regions',
    'priority_area_sets',
    'priority_area_options',
    'parcel_candidates',
    'candidate_parcels',
    'selected_priority_areas',
    'adaptation_projects',
    'adaptation_placements',
    'handoff_requests',
    'project_review_packages',
    'project_review_items',
    'evaluation_criteria_sets'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_livinglab_updated_at()',
      table_name,
      table_name
    );
  end loop;
end $$;

-- Demo policies. These are intentionally permissive for the public prototype
-- using the Supabase anon key. Tighten these policies before using real data.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'regions',
    'priority_area_sets',
    'priority_area_options',
    'parcel_candidates',
    'candidate_parcels',
    'selected_priority_areas',
    'adaptation_projects',
    'adaptation_placements',
    'handoff_requests',
    'project_review_packages',
    'project_review_items',
    'review_events',
    'evaluation_criteria_sets',
    'evaluation_indicators',
    'evaluation_runs',
    'evaluation_results'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "livinglab prototype read" on public.%I', table_name);
    execute format('drop policy if exists "livinglab prototype insert" on public.%I', table_name);
    execute format('drop policy if exists "livinglab prototype update" on public.%I', table_name);
    execute format('drop policy if exists "livinglab prototype delete" on public.%I', table_name);
    execute format('create policy "livinglab prototype read" on public.%I for select to anon, authenticated using (true)', table_name);
    execute format('create policy "livinglab prototype insert" on public.%I for insert to anon, authenticated with check (true)', table_name);
    execute format('create policy "livinglab prototype update" on public.%I for update to anon, authenticated using (true) with check (true)', table_name);
    execute format('create policy "livinglab prototype delete" on public.%I for delete to anon, authenticated using (true)', table_name);
  end loop;
end $$;
