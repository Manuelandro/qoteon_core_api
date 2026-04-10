create extension if not exists pgcrypto;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop table if exists public.project_competitors cascade;
drop table if exists public.projects cascade;
drop table if exists public.organization_users cascade;
drop table if exists public.organizations cascade;
drop table if exists public.users cascade;

create table if not exists public.core_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint core_users_role_check check (role in ('owner', 'admin', 'member'))
);

create table if not exists public.core_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan_type text not null default 'starter',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint core_organizations_plan_type_check check (plan_type in ('starter', 'growth', 'enterprise'))
);

create table if not exists public.core_organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.core_organizations (id) on delete cascade,
  user_id uuid not null references public.core_users (id) on delete cascade,
  org_role text not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  constraint core_organization_users_role_check check (org_role in ('owner', 'admin', 'member')),
  constraint core_organization_users_org_user_unique unique (organization_id, user_id)
);

create table if not exists public.core_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.core_organizations (id) on delete cascade,
  name text not null,
  domain text not null,
  company_name text not null,
  primary_category text not null,
  target_region text not null,
  target_language text not null,
  status text not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint core_projects_status_check check (status in ('draft', 'active', 'paused', 'archived'))
);

create table if not exists public.core_project_competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.core_projects (id) on delete cascade,
  competitor_name text not null,
  competitor_domain text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists core_organization_users_user_id_idx
  on public.core_organization_users (user_id);

create index if not exists core_organization_users_organization_id_idx
  on public.core_organization_users (organization_id);

create index if not exists core_projects_organization_id_idx
  on public.core_projects (organization_id);

create index if not exists core_projects_organization_id_status_idx
  on public.core_projects (organization_id, status);

create index if not exists core_projects_domain_idx
  on public.core_projects (domain);

create index if not exists core_project_competitors_project_id_idx
  on public.core_project_competitors (project_id);

drop trigger if exists core_users_set_updated_at on public.core_users;
create trigger core_users_set_updated_at
before update on public.core_users
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists core_organizations_set_updated_at on public.core_organizations;
create trigger core_organizations_set_updated_at
before update on public.core_organizations
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists core_projects_set_updated_at on public.core_projects;
create trigger core_projects_set_updated_at
before update on public.core_projects
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists core_project_competitors_set_updated_at on public.core_project_competitors;
create trigger core_project_competitors_set_updated_at
before update on public.core_project_competitors
for each row
execute procedure public.set_current_timestamp_updated_at();
