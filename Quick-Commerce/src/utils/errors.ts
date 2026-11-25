import { ApiError } from '../services/apiClient';

/** Turns anything thrown into a short, user-facing sentence. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** True when the failure is connectivity (offline / timeout), not a server answer. */
export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'network' || error.code === 'timeout');
}
