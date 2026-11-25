import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { errorMiddleware } from "../../middleware/error.middleware.js";
import { ClientError } from "../../config/clientError.js";
import { logger } from "../helpers/logger.mock.js"; // same fake the global mapper injects

// ---------- helpers ----------
const makeRes = () => {
  const res = {
    status: jest.fn<any>(),
    json: jest.fn<any>(),
  };
  res.status.mockReturnValue(res); // chainable: res.status(...).json(...)
  res.json.mockReturnValue(res);
  return res;
};

const req = {} as Request;
let res: ReturnType<typeof makeRes>;
let next: jest.Mock<any>;

const run = (err: unknown) =>
  errorMiddleware(err as Error, req, res as unknown as Response, next as unknown as NextFunction);

const INTERNAL_BODY = {
  success: false,
  message: "Internal Server Error",
  errorCode: "INTERNAL_SERVER_ERROR",
};

beforeEach(() => {
  res = makeRes();
  next = jest.fn<any>();
});

// =====================================================
describe("errorMiddleware: known client errors", () => {
  it("responds with the ClientError's status code, message and errorCode", () => {
    run(new ClientError("Session not found", 404, "SESSION_NOT_FOUND"));

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Session not found",
      errorCode: "SESSION_NOT_FOUND",
    });
  });

  it.each([
    [400, "INVALID_PAYLOAD"],
    [404, "USER_NOT_FOUND"],
    [409, "EMAIL_ALREADY_EXISTS"],
  ])("uses status %i for errorCode %s", (statusCode, errorCode) => {
    run(new ClientError("msg", statusCode, errorCode));

    expect(res.status).toHaveBeenCalledWith(statusCode);
  });

  it("returns an empty errorCode when the ClientError has none", () => {
    run(new ClientError("Sessions can't be created in the past", 400, "INVALID_PAYLOAD", {}));

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Sessions can't be created in the past",
      errorCode: "INVALID_PAYLOAD",
    });
  });

  it("never leaks meta to the client", () => {
    run(new ClientError("Duplicate", 409, "EMAIL_ALREADY_EXISTS", { email: "john@doe.com" }));

    const body = res.json.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("meta");
    expect(Object.keys(body).sort()).toEqual(["errorCode", "message", "success"]);
  });

  it("sends exactly one response and does not call next", () => {
    run(new ClientError("msg", 400, "X"));

    expect(res.status).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns the response object", () => {
    expect(run(new ClientError("msg", 400, "X"))).toBe(res);
  });
});

// =====================================================
describe("errorMiddleware: unexpected errors", () => {
  it("responds 500 with a generic body for a plain Error", () => {
    run(new Error("connection refused"));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
  });

  it("does not leak the internal error message", () => {
    run(new Error("password=secret at /app/db.ts:42"));

    const body = res.json.mock.calls[0]![0] as { message: string };
    expect(body.message).toBe("Internal Server Error");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it.each([
    ["TypeError", new TypeError("x is undefined")],
    ["RangeError", new RangeError("out of range")],
  ])("responds 500 for a %s", (_label, err) => {
    run(err);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
  });

  it("responds 500 for an Error that merely looks like a client error", () => {
    const fake = Object.assign(new Error("nope"), { statusCode: 404, errorCode: "FAKE" });

    run(fake);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
  });

  it("responds 500 for a ClientError whose isClientError flag is false", () => {
    const err = new ClientError("hidden", 400, "X");
    (err as any).isClientError = false;

    run(err);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
  });

  it("does not crash when a string is thrown instead of an Error", () => {
    expect(() => run("something broke")).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(INTERNAL_BODY);
  });

  it("currently turns a Mongo duplicate key error (E11000) into a 500", () => {
    // Documents today's behaviour. See note 1 below.
    run(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }));

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("does not call next", () => {
    run(new Error("boom"));

    expect(next).not.toHaveBeenCalled();
  });
});

// =====================================================
describe("errorMiddleware: logging", () => {
  it("logs the message and the error object for a client error", () => {
    const err = new ClientError("Session not found", 404, "SESSION_NOT_FOUND");

    run(err);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Session not found", err);
  });

  it("logs the real message for an unexpected error, even though the client sees a generic one", () => {
    const err = new Error("connection refused");

    run(err);

    expect(logger.error).toHaveBeenCalledWith("connection refused", err);
  });

  it("logs before responding", () => {
    const order: string[] = [];
    (logger.error as jest.Mock<any>).mockImplementation(() => order.push("log"));
    res.json.mockImplementation(() => {
      order.push("respond");
      return res;
    });

    run(new Error("boom"));

    expect(order).toEqual(["log", "respond"]);
  });
});
