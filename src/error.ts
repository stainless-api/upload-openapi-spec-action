import Stainless from "@stainless-api/sdk";

/** An expected failure (invalid input, missing files, auth failures) */
export class ActionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActionError";
  }
}

/** Mark user-facing Stainless API errors as expected failures. */
export function maybeToActionError(error: unknown): unknown {
  if (
    error instanceof Stainless.BadRequestError ||
    error instanceof Stainless.AuthenticationError ||
    error instanceof Stainless.PermissionDeniedError ||
    error instanceof Stainless.NotFoundError ||
    error instanceof Stainless.UnprocessableEntityError
  ) {
    return new ActionError(error.message, { cause: error });
  }
  return error;
}
