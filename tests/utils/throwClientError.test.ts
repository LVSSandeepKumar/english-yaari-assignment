import { describe, it, expect } from "@jest/globals";
import { throwClientError } from "../../utils/error/throwClientError.js";
import { ClientError } from "../../config/clientError.js";

// Helper: run the function and return whatever it threw (or undefined)
const catchError = (fn: () => void): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
};

describe("throwClientError", () => {
  it.each([false, 0, "", null, undefined])(
    "does not throw when the condition is falsy (%p)",
    (condition) => {
      expect(() => throwClientError(condition, "Should not throw")).not.toThrow();
    }
  );

  it("throws a ClientError with the message when the condition is true", () => {
    const err = catchError(() => throwClientError(true, "Session already booked"));

    expect(err).toBeInstanceOf(ClientError);
    expect((err as ClientError).message).toBe("Session already booked");
  });

  it("uses the defaults: status 400, empty error code, empty meta", () => {
    const err = catchError(() => throwClientError(true, "Bad request")) as ClientError;

    expect(err).toMatchObject({ statusCode: 400, errorCode: "", meta: {} });
  });

  it("passes custom statusCode, errorCode and meta through", () => {
    const meta = { sessionId: "abc" };
    const err = catchError(() =>
      throwClientError(true, "Session not found", 404, "SESSION_NOT_FOUND", meta)
    ) as ClientError;

    expect(err).toMatchObject({
      statusCode: 404,
      errorCode: "SESSION_NOT_FOUND",
      meta,
    });
  });
});