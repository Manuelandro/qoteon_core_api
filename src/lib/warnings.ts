import { ServiceWarning } from "../domain/core";
import { AppError } from "../errors/app-error";

export function to_service_warning(
  service: ServiceWarning["service"],
  error: unknown,
  fallback_code: string,
  fallback_message: string,
): ServiceWarning {
  if (error instanceof AppError) {
    return {
      code: error.code || fallback_code,
      message: error.message,
      service,
      retryable: error.status_code >= 500,
      details: error.details,
    };
  }

  return {
    code: fallback_code,
    message: fallback_message,
    service,
    retryable: true,
  };
}
