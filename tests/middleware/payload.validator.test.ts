import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import Joi from "joi";
import type { Request, Response, NextFunction } from "express";
import { validate } from "../../middleware/payload.validator.js";
import { ClientError } from "../../config/clientError.js";
import { userValidator } from "../../validators/user.validator.js";

// ---------- helpers ----------
const res = {} as Response; // the middleware never touches res
let next: jest.Mock<any>;

const run = (schema: Joi.ObjectSchema, body: unknown) => {
  const req = { body } as Request;
  validate(schema)(req, res, next as unknown as NextFunction);
  return req;
};

// The error passed to next(), or undefined if next() was called with nothing
const nextError = () => next.mock.calls[0]?.[0] as ClientError | undefined;

const simpleSchema = Joi.object({
  name: Joi.string().trim().required().messages({ "any.required": "Name is required" }),
  age: Joi.number().required().messages({ "any.required": "Age is required" }),
});

beforeEach(() => {
  next = jest.fn<any>();
});

// =====================================================
describe("validate: wiring", () => {
  it("returns a middleware function", () => {
    expect(typeof validate(simpleSchema)).toBe("function");
  });

  it("validates req.body with abortEarly, stripUnknown and convert", () => {
    const fakeSchema = {
      validate: jest.fn<any>().mockReturnValue({ value: { ok: true } }),
    };
    const body = { a: 1 };

    run(fakeSchema as unknown as Joi.ObjectSchema, body);

    expect(fakeSchema.validate).toHaveBeenCalledTimes(1);
    expect(fakeSchema.validate).toHaveBeenCalledWith(body, {
      abortEarly: true,
      stripUnknown: true,
      convert: true,
    });
  });

  it("creates an independent middleware per schema", () => {
    const a = validate(simpleSchema);
    const b = validate(Joi.object({ other: Joi.string().required() }));

    const reqA = { body: { name: "JohnDoe", age: 41 } } as Request;
    a(reqA, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(typeof b).toBe("function");
  });
});

// =====================================================
describe("validate: valid body", () => {
  it("calls next() once with no arguments", () => {
    run(simpleSchema, { name: "John Doe", age: 7 });

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("replaces req.body with the validated value", () => {
    const req = run(simpleSchema, { name: "John Doe", age: 7 });

    expect(req.body).toEqual({ name: "John Doe", age: 7 });
  });

  it("applies trimming from the schema", () => {
    const req = run(simpleSchema, { name: "  John Doe  ", age: 7 });

    expect(req.body.name).toBe("John Doe");
  });

  it("converts types (convert: true)", () => {
    const req = run(simpleSchema, { name: "John Doe", age: "7" });

    expect(req.body.age).toBe(7);
  });

  it("strips unknown fields instead of rejecting them (stripUnknown: true)", () => {
    const req = run(simpleSchema, { name: "John Doe", age: 7, role: "admin", isAdmin: true });

    expect(req.body).toEqual({ name: "John Doe", age: 7 });
    expect(next).toHaveBeenCalledWith();
  });

  it("works with the real userValidator: trims, lowercases, and strips", () => {
    const req = run(userValidator, {
      fullName: "  John Doe ",
      email: " JOHN@DOE.COM ",
      phone: "7777777777",
      role: "admin",
    });

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({
      fullName: "John Doe",
      email: "john@doe.com",
      phone: "7777777777",
    });
  });
});

// =====================================================
describe("validate: invalid body", () => {
  it("forwards a ClientError to next() instead of throwing", () => {
    expect(() => run(simpleSchema, {})).not.toThrow();

    expect(next).toHaveBeenCalledTimes(1);
    expect(nextError()).toBeInstanceOf(ClientError);
  });

  it("uses status 400 and errorCode VALIDATION_FAILED", () => {
    run(simpleSchema, {});

    expect(nextError()).toMatchObject({ statusCode: 400, errorCode: "VALIDATION_FAILED" });
  });

  it("uses the schema's custom message", () => {
    run(simpleSchema, { age: 7 });

    expect(nextError()?.message).toBe("Name is required");
  });

  it("reports only the first error even when several fields are invalid", () => {
    run(simpleSchema, {}); // both name and age are missing

    expect(next).toHaveBeenCalledTimes(1);
    expect(nextError()?.message).toBe("Name is required");
  });

  it("does not replace req.body when validation fails", () => {
    const body = { name: "  John Doe  " }; // age missing
    const req = run(simpleSchema, body);

    expect(req.body).toBe(body);
    expect(req.body.name).toBe("  John Doe  "); // not trimmed
  });

  it.each([
    ["a wrong type", { name: "John Doe", age: "seven" }],
    ["a null field", { name: null, age: 7 }],
  ])("rejects %s", (_label, body) => {
    run(simpleSchema, body);

    expect(nextError()).toBeInstanceOf(ClientError);
    expect(nextError()?.statusCode).toBe(400);
  });

  it("works with the real userValidator messages", () => {
    run(userValidator, { fullName: "John Doe", email: "not-an-email", phone: "7777777777" });

    expect(nextError()).toMatchObject({
      message: "Please enter a valid email",
      statusCode: 400,
      errorCode: "VALIDATION_FAILED",
    });
  });
});

// =====================================================
describe("validate: edge cases", () => {
  it("lets an undefined body through when the schema itself is not required", () => {
    // Documents today's behaviour. See note 2 below.
    const req = run(simpleSchema, undefined);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toBeUndefined();
  });

  it("rejects a body that is not an object", () => {
    run(simpleSchema, "just a string");

    expect(nextError()).toBeInstanceOf(ClientError);
    expect(nextError()?.statusCode).toBe(400);
  });

  it("rejects an array body", () => {
    run(simpleSchema, []);

    expect(nextError()).toBeInstanceOf(ClientError);
  });
});