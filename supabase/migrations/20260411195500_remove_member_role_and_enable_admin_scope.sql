update public.core_users
set role = 'owner'
where role = 'member';

update public.core_organization_users
set org_role = 'owner'
where org_role = 'member';

alter table public.core_users
  alter column role set default 'owner';

alter table public.core_users
  drop constraint if exists core_users_role_check;

alter table public.core_users
  add constraint core_users_role_check
  check (role in ('owner', 'admin'));

alter table public.core_organization_users
  alter column org_role set default 'owner';

alter table public.core_organization_users
  drop constraint if exists core_organization_users_role_check;

alter table public.core_organization_users
  add constraint core_organization_users_role_check
  check (org_role in ('owner', 'admin'));
