import { z } from "zod";

import { DASHBOARD_RUN_TYPES, PROJECT_STATUSES } from "../domain/core";

const id_schema = z.string().min(1);
const iso_datetime_schema = z.string().datetime();
const sort_direction_schema = z.enum(["asc", "desc"]);

const dashboard_base_query_input_schema = z.object({
  run_batch_id: id_schema.optional(),
  runBatchId: id_schema.optional(),
  run_type: z.enum(DASHBOARD_RUN_TYPES).optional(),
  runType: z.enum(DASHBOARD_RUN_TYPES).optional(),
  start_date: iso_datetime_schema.optional(),
  startDate: iso_datetime_schema.optional(),
  end_date: iso_datetime_schema.optional(),
  endDate: iso_datetime_schema.optional(),
});

export const dashboard_projects_query_schema = z
  .object({
    organization_id: id_schema.optional(),
    organizationId: id_schema.optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  })
  .transform((value) => ({
    organizationId: value.organizationId ?? value.organization_id,
    status: value.status,
    limit: value.limit,
  }));

export const dashboard_base_query_schema = dashboard_base_query_input_schema.transform((value) => ({
  runBatchId: value.runBatchId ?? value.run_batch_id,
  runType: value.runType ?? value.run_type,
  startDate: value.startDate ?? value.start_date,
  endDate: value.endDate ?? value.end_date,
}));

export const dashboard_models_query_schema = dashboard_base_query_input_schema
  .extend({
    model_id: id_schema.optional(),
    modelId: id_schema.optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    sort_by: z
      .enum([
        "modelName",
        "totalExecutions",
        "mentionRate",
        "avgPosition",
        "shareOfVoice",
        "competitorPressure",
        "visibilityScore",
      ])
      .optional(),
    sortBy: z
      .enum([
        "modelName",
        "totalExecutions",
        "mentionRate",
        "avgPosition",
        "shareOfVoice",
        "competitorPressure",
        "visibilityScore",
      ])
      .optional(),
    sort_direction: sort_direction_schema.optional(),
    sortDirection: sort_direction_schema.optional(),
  })
  .transform((value) => ({
    runBatchId: value.runBatchId ?? value.run_batch_id,
    runType: value.runType ?? value.run_type,
    startDate: value.startDate ?? value.start_date,
    endDate: value.endDate ?? value.end_date,
    modelId: value.modelId ?? value.model_id,
    limit: value.limit,
    sortBy: value.sortBy ?? value.sort_by,
    sortDirection: value.sortDirection ?? value.sort_direction,
  }));

export const dashboard_clusters_query_schema = dashboard_base_query_input_schema
  .extend({
    cluster_name: z.string().min(1).optional(),
    clusterName: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    sort_by: z
      .enum([
        "clusterName",
        "totalExecutions",
        "mentionRate",
        "avgPosition",
        "shareOfVoice",
        "competitorPressure",
        "visibilityScore",
      ])
      .optional(),
    sortBy: z
      .enum([
        "clusterName",
        "totalExecutions",
        "mentionRate",
        "avgPosition",
        "shareOfVoice",
        "competitorPressure",
        "visibilityScore",
      ])
      .optional(),
    sort_direction: sort_direction_schema.optional(),
    sortDirection: sort_direction_schema.optional(),
  })
  .transform((value) => ({
    runBatchId: value.runBatchId ?? value.run_batch_id,
    runType: value.runType ?? value.run_type,
    startDate: value.startDate ?? value.start_date,
    endDate: value.endDate ?? value.end_date,
    clusterName: value.clusterName ?? value.cluster_name,
    limit: value.limit,
    sortBy: value.sortBy ?? value.sort_by,
    sortDirection: value.sortDirection ?? value.sort_direction,
  }));

export const dashboard_competitors_query_schema = dashboard_base_query_input_schema
  .extend({
    cluster_name: z.string().min(1).optional(),
    clusterName: z.string().min(1).optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    sort_by: z
      .enum([
        "competitorName",
        "totalMentions",
        "mentionRate",
        "shareOfVoice",
        "winsAgainstClientCount",
        "clientVsCompetitorDelta",
      ])
      .optional(),
    sortBy: z
      .enum([
        "competitorName",
        "totalMentions",
        "mentionRate",
        "shareOfVoice",
        "winsAgainstClientCount",
        "clientVsCompetitorDelta",
      ])
      .optional(),
    sort_direction: sort_direction_schema.optional(),
    sortDirection: sort_direction_schema.optional(),
  })
  .transform((value) => ({
    runBatchId: value.runBatchId ?? value.run_batch_id,
    runType: value.runType ?? value.run_type,
    startDate: value.startDate ?? value.start_date,
    endDate: value.endDate ?? value.end_date,
    clusterName: value.clusterName ?? value.cluster_name,
    limit: value.limit,
    sortBy: value.sortBy ?? value.sort_by,
    sortDirection: value.sortDirection ?? value.sort_direction,
  }));

export const dashboard_trends_query_schema = z
  .object({
    run_type: z.enum(DASHBOARD_RUN_TYPES).optional(),
    runType: z.enum(DASHBOARD_RUN_TYPES).optional(),
    start_date: iso_datetime_schema.optional(),
    startDate: iso_datetime_schema.optional(),
    end_date: iso_datetime_schema.optional(),
    endDate: iso_datetime_schema.optional(),
    limit: z.coerce.number().int().positive().max(120).optional(),
  })
  .transform((value) => ({
    runType: value.runType ?? value.run_type,
    startDate: value.startDate ?? value.start_date,
    endDate: value.endDate ?? value.end_date,
    limit: value.limit,
  }));
