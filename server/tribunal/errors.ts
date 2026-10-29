import { defineActionErrors } from "@agent-native/core/action";

export type TribunalErrorCode =
  | "not_found"
  | "invalid_state"
  | "not_independent"
  | "conflict"
  | "upstream_failed"
  | "unauthorized";

const STATUS: Record<TribunalErrorCode, number> = {
  not_found: 404,
  invalid_state: 409,
  not_independent: 403,
  conflict: 409,
  upstream_failed: 502,
  unauthorized: 401,
};

/**
 * A refusal from the tribunal rules. Nothing was written unless `mayHaveWritten`
 * is set (a remote call failed after the request may have taken effect).
 */
export class TribunalError extends Error {
  constructor(
    message: string,
    readonly code: TribunalErrorCode,
    readonly mayHaveWritten = false,
  ) {
    super(message);
    this.name = "TribunalError";
  }
}

export const tribunalErrors = defineActionErrors(
  "not_found",
  "invalid_state",
  "not_independent",
  "conflict",
  "upstream_failed",
  "unauthorized",
);

/** Runs an action body and turns rule refusals into typed action errors with a status code. */
export async function guarded<T>(body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof TribunalError) {
      const options = { statusCode: STATUS[err.code] };
      if (err.mayHaveWritten)
        tribunalErrors.fail(err.message, err.code, options);
      tribunalErrors.noWrite(err.message, err.code, options);
    }
    throw err;
  }
}
