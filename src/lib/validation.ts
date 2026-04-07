import { ZodType, ZodTypeDef, ZodError } from "zod";

import { ValidationError } from "../errors/app-error";

export function parse_schema<T>(schema: ZodType<T, ZodTypeDef, unknown>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ValidationError("Request validation failed", {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      });
    }
    throw error;
  }
}
