import { MeteredQuotaKey, OrganizationUsageCounter } from "../domain/core";

export interface OrganizationUsageRepository {
  get_usage_counter(
    organization_id: string,
    quota_key: MeteredQuotaKey,
    period_key: string,
  ): Promise<OrganizationUsageCounter | null>;
  consume_usage(
    organization_id: string,
    quota_key: MeteredQuotaKey,
    period_key: string,
    amount: number,
    limit: number,
  ): Promise<OrganizationUsageCounter>;
  release_usage(
    organization_id: string,
    quota_key: MeteredQuotaKey,
    period_key: string,
    amount: number,
  ): Promise<OrganizationUsageCounter>;
}
