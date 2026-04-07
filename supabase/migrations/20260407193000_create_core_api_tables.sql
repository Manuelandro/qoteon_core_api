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

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint users_role_check check (role in ('owner', 'admin', 'member'))
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan_type text not null default 'starter',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organizations_plan_type_check check (plan_type in ('starter', 'growth', 'enterprise'))
);

create table if not exists public.organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  org_role text not null default 'member',
  created_at timestamptz not null default timezone('utc', now()),
  constraint organization_users_role_check check (org_role in ('owner', 'admin', 'member')),
  constraint organization_users_org_user_unique unique (organization_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  domain text not null,
  company_name text not null,
  primary_category text not null,
  target_region text not null,
  target_language text not null,
  status text not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint projects_status_check check (status in ('draft', 'active', 'paused', 'archived'))
);

create table if not exists public.project_competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  competitor_name text not null,
  competitor_domain text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists organization_users_user_id_idx
  on public.organization_users (user_id);

create index if not exists organization_users_organization_id_idx
  on public.organization_users (organization_id);

create index if not exists projects_organization_id_idx
  on public.projects (organization_id);

create index if not exists projects_organization_id_status_idx
  on public.projects (organization_id, status);

create index if not exists projects_domain_idx
  on public.projects (domain);

create index if not exists project_competitors_project_id_idx
  on public.project_competitors (project_id);

create trigger users_set_updated_at
before update on public.users
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row
execute procedure public.set_current_timestamp_updated_at();

create trigger project_competitors_set_updated_at
before update on public.project_competitors
for each row
execute procedure public.set_current_timestamp_updated_at();
