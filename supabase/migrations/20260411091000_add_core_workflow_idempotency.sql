create table if not exists public.core_workflow_idempotency (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  user_id text not null,
  project_id uuid not null references public.core_projects (id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'in_progress',
  response_status_code integer,
  response_body_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  constraint core_workflow_idempotency_operation_check
    check (operation in ('run_launch', 'crawl_trigger')),
  constraint core_workflow_idempotency_status_check
    check (status in ('in_progress', 'completed'))
);

create unique index if not exists core_workflow_idempotency_unique_key
  on public.core_workflow_idempotency (operation, user_id, project_id, idempotency_key);

create index if not exists core_workflow_idempotency_expires_at_idx
  on public.core_workflow_idempotency (expires_at);

drop trigger if exists core_workflow_idempotency_set_updated_at on public.core_workflow_idempotency;
create trigger core_workflow_idempotency_set_updated_at
before update on public.core_workflow_idempotency
for each row
execute procedure public.set_current_timestamp_updated_at();
