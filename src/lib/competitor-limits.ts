import type { PlanType } from "../domain/core";
import { ValidationError } from "../errors/app-error";
import { get_plan_definition } from "./plan-catalog";

export const COMPETITOR_LIMITS_BY_PLAN: Record<PlanType, number> = {
  trial: get_plan_definition("trial").competitor_limit,
  starter: get_plan_definition("starter").competitor_limit,
  growth: get_plan_definition("growth").competitor_limit,
  enterprise: get_plan_definition("enterprise").competitor_limit,
};

export function get_competitor_limit_for_plan(plan_type: PlanType): number {
  return COMPETITOR_LIMITS_BY_PLAN[plan_type];
}

export function assert_competitor_limit(
  plan_type: PlanType,
  total_competitor_count: number,
): void {
  const limit = get_competitor_limit_for_plan(plan_type);

  if (total_competitor_count <= limit) {
    return;
  }

  throw new ValidationError(`The ${plan_type} plan supports up to ${limit} competitors.`, {
    plan_type,
    competitor_limit: limit,
    requested_competitor_count: total_competitor_count,
  });
}
