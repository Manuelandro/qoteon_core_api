import { type Pool } from "pg";

import { ConflictError } from "../errors/app-error";
import { throw_postgres_error, to_iso_string, with_transaction } from "../db/postgres";
import { MeteredQuotaKey, OrganizationUsageCounter } from "../domain/core";
import { OrganizationUsageRepository } from "./organization-usage-repository";

interface OrganizationUsageCounterRow {
  id: string;
  organization_id: string;
  quota_key: MeteredQuotaKey;
  period_key: string;
  used_count: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export class PostgresOrganizationUsageRepository implements OrganizationUsageRepository {
  constructor(private readonly pool: Pool) {}

  async get_usage_counter(
    organization_id: string,
    quota_key: MeteredQuotaKey,
    period_key: string,
  ): Promise<OrganizationUsageCounter | null> {
    try {
      const result = await this.pool.query<OrganizationUsageCounterRow>(
        `
          select *
          from public.core_organization_usage_counters
          where organization_id = $1
            and quota_key = $2
            and period_key = $3
          limit 1
        `,
        [organization_id, quota_key, period_key],
      );

      const row = result.rows[0];
      return row ? map_usage_counter(row) : null;
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to load organization usage");
    }
  }

  async consume_usage(
    organization_id: string,
    quota_key: MeteredQuotaKey,
    period_key: string,
    amount: number,
    limit: number,
  ): Promise<OrganizationUsageCounter> {
    try {
      return await with_transaction(this.pool, async (client) => {
        await client.query(
          `
            insert into public.core_organization_usage_counters (
              organization_id,
              quota_key,
              period_key,
              used_count
            )
            values ($1, $2, $3, 0)
            on conflict (organization_id, quota_key, period_key) do nothing
          `,
          [organization_id, quota_key, period_key],
        );

        const existing_result = await client.query<OrganizationUsageCounterRow>(
          `
            select *
            from public.core_organization_usage_counters
            where organization_id = $1
              and quota_key = $2
              and period_key = $3
            for update
          `,
          [organization_id, quota_key, period_key],
        );

        const existing = existing_result.rows[0];

        if (!existing) {
          throw new Error("Usage counter row is missing");
        }

        if (existing.used_count + amount > limit) {
          throw new ConflictError("Quota exceeded", {
            organization_id,
            quota_key,
            period_key,
            limit,
            used_count: existing.used_count,
            requested_amount: amount,
          });
        }

        const updated_result = await client.query<OrganizationUsageCounterRow>(
          `
            update public.core_organization_usage_counters
            set used_count = used_count + $4,
                updated_at = timezone('utc', now())
            where organization_id = $1
              and quota_key = $2
              and period_key = $3
            returning *
          `,
          [organization_id, quota_key, period_key, amount],
        );

        const updated = updated_result.rows[0];

        if (!updated) {
          throw new Error("Failed to update usage counter");
        }

        return map_usage_counter(updated);
      });
    } catch (error) {
      if (error instanceof ConflictError) {
        throw error;
      }

      throw_postgres_error(as_postgres_error(error), "Unable to consume organization usage");
    }
  }

  async release_usage(
    organization_id: string,
    quota_key: MeteredQuotaKey,
    period_key: string,
    amount: number,
  ): Promise<OrganizationUsageCounter> {
    try {
      return await with_transaction(this.pool, async (client) => {
        await client.query(
          `
            insert into public.core_organization_usage_counters (
              organization_id,
              quota_key,
              period_key,
              used_count
            )
            values ($1, $2, $3, 0)
            on conflict (organization_id, quota_key, period_key) do nothing
          `,
          [organization_id, quota_key, period_key],
        );

        const updated_result = await client.query<OrganizationUsageCounterRow>(
          `
            update public.core_organization_usage_counters
            set used_count = greatest(used_count - $4, 0),
                updated_at = timezone('utc', now())
            where organization_id = $1
              and quota_key = $2
              and period_key = $3
            returning *
          `,
          [organization_id, quota_key, period_key, amount],
        );

        const updated = updated_result.rows[0];

        if (!updated) {
          throw new Error("Failed to update usage counter");
        }

        return map_usage_counter(updated);
      });
    } catch (error) {
      throw_postgres_error(as_postgres_error(error), "Unable to release organization usage");
    }
  }
}

function map_usage_counter(row: OrganizationUsageCounterRow): OrganizationUsageCounter {
  return {
    id: row.id,
    organization_id: row.organization_id,
    quota_key: row.quota_key,
    period_key: row.period_key,
    used_count: row.used_count,
    created_at: to_iso_string(row.created_at),
    updated_at: to_iso_string(row.updated_at),
  };
}

function as_postgres_error(error: unknown): { message?: string; code?: string; detail?: string | null } | null {
  if (error && typeof error === "object") {
    return error as { message?: string; code?: string; detail?: string | null };
  }

  return null;
}
