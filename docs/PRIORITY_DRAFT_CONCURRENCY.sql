-- Forward-only, additive upgrade. Existing snapshots remain intact.
-- Applied to Supabase through the named priority_draft_concurrency migration.
alter table public.priority_area_sets
  add column if not exists lineage_id uuid,
  add column if not exists parent_id uuid references public.priority_area_sets(id),
  add column if not exists deleted_at timestamptz,
  add column if not exists management_version bigint not null default 1;
update public.priority_area_sets set lineage_id = id where lineage_id is null;
alter table public.priority_area_sets alter column lineage_id set not null;
create sequence if not exists public.priority_draft_number_seq;
select setval('public.priority_draft_number_seq', greatest(1,
  (select last_value from public.priority_draft_number_seq),
  coalesce((select max(substring(analysis_version from '^draft/([0-9]+)$')::bigint)
    from public.priority_area_sets), 0)), true);
grant usage on sequence public.priority_draft_number_seq to anon, authenticated;
create unique index if not exists priority_draft_one_successor
  on public.priority_area_sets(parent_id) where parent_id is not null;
create unique index if not exists priority_draft_version_unique
  on public.priority_area_sets(region_code, hazard_type, analysis_version);
create index if not exists priority_draft_list_idx
  on public.priority_area_sets(region_code, hazard_type, status, created_at desc, id desc)
  where deleted_at is null;
create index if not exists priority_draft_lineage_idx
  on public.priority_area_sets(lineage_id, created_at desc);

create or replace function public.guard_priority_draft_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare parent public.priority_area_sets; existing public.priority_area_sets; number bigint;
begin
  if TG_OP = 'INSERT' then
    -- Idempotent POST uses the same primary key and ON CONFLICT DO NOTHING.
    select * into existing from public.priority_area_sets where id = new.id;
    if found then
      return existing;
    end if;
    if new.parent_id is not null then
      select * into parent from public.priority_area_sets where id = new.parent_id for update;
      if not found or parent.deleted_at is not null or parent.status <> 'draft' then
        raise sqlstate 'PT409' using message = 'DRAFT_PARENT_UNAVAILABLE';
      end if;
      if parent.region_code <> new.region_code or parent.hazard_type <> new.hazard_type then
        raise sqlstate 'PT409' using message = 'DRAFT_SCOPE_MISMATCH';
      end if;
      if exists(select 1 from public.priority_area_sets where parent_id = new.parent_id) then
        raise sqlstate 'PT409' using message = 'DRAFT_STALE_PARENT';
      end if;
      new.lineage_id := parent.lineage_id;
    else
      new.lineage_id := new.id;
    end if;
    number := nextval('public.priority_draft_number_seq');
    new.analysis_version := 'draft/' || number;
    if nullif(trim(new.set_name), '') is null then
      new.set_name := coalesce(new.scenario_name, new.region_code) || ' 저장본 ' || number;
    end if;
    new.management_version := 1;
    new.created_at := clock_timestamp();
  else
    if new.id is distinct from old.id or new.analysis_conditions is distinct from old.analysis_conditions
      or new.lineage_id is distinct from old.lineage_id or new.parent_id is distinct from old.parent_id
      or new.analysis_version is distinct from old.analysis_version
      or new.created_at is distinct from old.created_at or new.created_by_user is distinct from old.created_by_user
      or new.created_by_tool is distinct from old.created_by_tool
      or new.region_code is distinct from old.region_code or new.hazard_type is distinct from old.hazard_type then
      raise sqlstate 'PT409' using message = 'DRAFT_SNAPSHOT_IMMUTABLE';
    end if;
    new.management_version := old.management_version + 1;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.guard_priority_draft_write() from public;
drop trigger if exists guard_priority_draft_write on public.priority_area_sets;
create trigger guard_priority_draft_write before insert or update on public.priority_area_sets
for each row execute function public.guard_priority_draft_write();
-- Existing RLS policies are intentionally unchanged. Operator labels are NOT identities.
