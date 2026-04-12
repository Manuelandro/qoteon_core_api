alter table public.core_organizations
  drop constraint if exists core_organizations_plan_type_check;

alter table public.core_organizations
  add column if not exists billing_status text,
  add column if not exists project_limit integer,
  add column if not exists competitor_limit integer,
  add column if not exists tracked_model_limit integer,
  add column if not exists tracked_prompts_daily_limit integer,
  add column if not exists llm_response_limit integer,
  add column if not exists article_draft_limit integer,
  add column if not exists page_improvement_limit integer,
  add column if not exists crawled_page_limit integer,
  add column if not exists data_retention_months integer,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_expires_at timestamptz,
  add column if not exists billing_period_started_at timestamptz,
  add column if not exists billing_period_ends_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

update public.core_organizations
set
  billing_status = coalesce(
    billing_status,
    case
      when plan_type = 'trial' then 'trialing'
      else 'active'
    end
  ),
  project_limit = coalesce(
    project_limit,
    case plan_type
      when 'trial' then 1
      when 'starter' then 1
      when 'growth' then 3
      when 'enterprise' then 5
      else 1
    end
  ),
  competitor_limit = coalesce(
    competitor_limit,
    case plan_type
      when 'trial' then 3
      when 'starter' then 3
      when 'growth' then 6
      when 'enterprise' then 10
      else 3
    end
  ),
  tracked_model_limit = coalesce(
    tracked_model_limit,
    case plan_type
      when 'trial' then 3
      when 'starter' then 3
      when 'growth' then 4
      when 'enterprise' then 5
      else 3
    end
  ),
  tracked_prompts_daily_limit = coalesce(
    tracked_prompts_daily_limit,
    case plan_type
      when 'trial' then 5
      when 'starter' then 20
      when 'growth' then 50
      when 'enterprise' then 150
      else 5
    end
  ),
  llm_response_limit = coalesce(
    llm_response_limit,
    case plan_type
      when 'trial' then 1350
      when 'starter' then 1350
      when 'growth' then 6000
      when 'enterprise' then 22500
      else 1350
    end
  ),
  article_draft_limit = coalesce(
    article_draft_limit,
    case plan_type
      when 'trial' then 1
      when 'starter' then 10
      when 'growth' then 20
      when 'enterprise' then 30
      else 1
    end
  ),
  page_improvement_limit = coalesce(
    page_improvement_limit,
    case plan_type
      when 'trial' then 3
      when 'starter' then 10
      when 'growth' then 25
      when 'enterprise' then 50
      else 3
    end
  ),
  crawled_page_limit = coalesce(
    crawled_page_limit,
    case plan_type
      when 'trial' then 10
      when 'starter' then 750
      when 'growth' then 3000
      when 'enterprise' then 10000
      else 10
    end
  ),
  data_retention_months = coalesce(
    data_retention_months,
    case plan_type
      when 'trial' then null
      when 'starter' then 3
      when 'growth' then 12
      when 'enterprise' then 4
      else null
    end
  ),
  trial_started_at = coalesce(
    trial_started_at,
    case
      when plan_type = 'trial' then created_at
      else null
    end
  ),
  trial_expires_at = coalesce(
    trial_expires_at,
    case
      when plan_type = 'trial' then created_at + interval '3 days'
      else null
    end
  ),
  billing_period_started_at = coalesce(
    billing_period_started_at,
    case
      when plan_type = 'trial' then null
      else created_at
    end
  ),
  billing_period_ends_at = coalesce(
    billing_period_ends_at,
    case
      when plan_type = 'trial' then null
      else created_at + interval '1 month'
    end
  );

alter table public.core_organizations
  alter column billing_status set not null,
  alter column project_limit set not null,
  alter column competitor_limit set not null,
  alter column tracked_model_limit set not null,
  alter column tracked_prompts_daily_limit set not null,
  alter column llm_response_limit set not null,
  alter column article_draft_limit set not null,
  alter column page_improvement_limit set not null,
  alter column crawled_page_limit set not null;

alter table public.core_organizations
  add constraint core_organizations_plan_type_check
  check (plan_type in ('trial', 'starter', 'growth', 'enterprise'));

alter table public.core_organizations
  add constraint core_organizations_billing_status_check
  check (billing_status in ('trialing', 'active', 'expired', 'cancelled'));

create table if not exists public.core_organization_usage_counters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.core_organizations (id) on delete cascade,
  quota_key text not null,
  period_key text not null,
  used_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint core_organization_usage_counters_quota_key_check check (
    quota_key in (
      'tracked_prompts_daily',
      'llm_responses',
      'article_drafts',
      'page_improvements',
      'crawled_pages'
    )
  ),
  constraint core_organization_usage_counters_unique unique (organization_id, quota_key, period_key)
);

create index if not exists core_organization_usage_counters_org_quota_idx
  on public.core_organization_usage_counters (organization_id, quota_key);

drop trigger if exists core_organization_usage_counters_set_updated_at on public.core_organization_usage_counters;
create trigger core_organization_usage_counters_set_updated_at
before update on public.core_organization_usage_counters
for each row
execute procedure public.set_current_timestamp_updated_at();
