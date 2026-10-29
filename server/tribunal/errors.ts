import { defineActionErrors } from "@agent-native/core/action";

export type TribunalErrorCode =
  | "not_found"
  | "invalid_state"
  | "not_independent"
  | "conflict"
  | "upstream_failed";

const STATUS: Record<TribunalErrorCode, number> = {
  not_found: 404,
  invalid_state: 409,
  not_independent: 403,
  conflict: 409,
  upstream_failed: 502,
};

/** A refusal from the tribunal rules: nothing was written. */
export class TribunalError extends Error {
  constructor(
    message: string,
    readonly code: TribunalErrorCode,
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
);

/** Runs an action body and turns rule refusals into typed action errors with a status code. */
export async function guarded<T>(body: () => Promise<T>): Promise<T> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof TribunalError) {
      tribunalErrors.noWrite(err.message, err.code, {
        statusCode: STATUS[err.code],
      });
    }
    throw err;
  }
}
