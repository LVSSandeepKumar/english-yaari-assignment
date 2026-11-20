import { describe, it, expect } from "@jest/globals";
import { sessionValidator } from "../../validators/session.validator.js";

type Payload = Record<string, unknown>;

const validPayload = {
  teacherId: "64b7f0c2f1a2b3c4d5e6f701", // 24 hex characters
  startTime: "2026-11-25T10:00:00.000Z",
  endTime: "2026-11-25T11:00:00.000Z",
};

// ---------- helpers ----------
const validate = (payload: Payload, abortEarly = true) =>
  sessionValidator.validate(payload, { abortEarly });

const firstError = (payload: Payload) => validate(payload).error?.details[0];

const withField = (field: string, value: unknown): Payload => ({
  ...validPayload,
  [field]: value,
});

const withoutField = (field: keyof typeof validPayload): Payload => {
  const copy: Payload = { ...validPayload };
  delete copy[field];
  return copy;
};

describe("sessionValidator", () => {
  // =====================================================
  describe("valid payloads", () => {
    it("accepts a fully valid payload", () => {
      const { error } = validate(validPayload);

      expect(error).toBeUndefined();
    });

    it("converts startTime and endTime strings into Date objects", () => {
      const { error, value } = validate(validPayload);

      expect(error).toBeUndefined();
      expect(value.startTime).toBeInstanceOf(Date);
      expect(value.endTime).toBeInstanceOf(Date);
      expect(value.startTime).toEqual(new Date(validPayload.startTime));
      expect(value.endTime).toEqual(new Date(validPayload.endTime));
    });

    it("accepts Date objects", () => {
      const { error } = validate({
        ...validPayload,
        startTime: new Date(validPayload.startTime),
        endTime: new Date(validPayload.endTime),
      });

      expect(error).toBeUndefined();
    });

    it("accepts millisecond timestamps as numbers", () => {
      const start = Date.UTC(2026, 10, 25, 10);
      const { error } = validate({
        ...validPayload,
        startTime: start,
        endTime: start + 60 * 60 * 1000,
      });

      expect(error).toBeUndefined();
    });

    it("accepts date-only strings", () => {
      const { error } = validate({
        ...validPayload,
        startTime: "2026-11-25",
        endTime: "2026-11-26",
      });

      expect(error).toBeUndefined();
    });

    it("accepts an uppercase hex teacherId", () => {
      expect(
        validate(withField("teacherId", "64B7F0C2F1A2B3C4D5E6F701")).error
      ).toBeUndefined();
    });
  });

  // =====================================================
  describe("teacherId", () => {
    it("fails with the custom message when missing", () => {
      expect(firstError(withoutField("teacherId"))).toMatchObject({
        type: "any.required",
        message: "Teacher id is required",
        path: ["teacherId"],
      });
    });

    it("fails when empty", () => {
      expect(firstError(withField("teacherId", ""))).toMatchObject({
        type: "string.empty",
        path: ["teacherId"],
      });
    });

    it.each([
      ["a number", 123],
      ["null", null],
      ["a boolean", true],
      ["an object", {}],
    ])("rejects %s (not a string)", (_label, value) => {
      expect(firstError(withField("teacherId", value))).toMatchObject({
        type: "string.base",
        path: ["teacherId"],
      });
    });

    it.each([
      ["non-hex letters", "zzzzzzzzzzzzzzzzzzzzzzzz"],
      ["a hyphen inside", "64b7f0c2-f1a2b3c4d5e6f70"],
      ["only spaces (no trim in the schema)", "                        "],
      ["a leading space (24 chars + space)", " 64b7f0c2f1a2b3c4d5e6f701"],
    ])("fails the hex rule for an id with %s", (_label, value) => {
      expect(firstError(withField("teacherId", value))).toMatchObject({
        type: "string.hex",
        path: ["teacherId"],
      });
    });

    it.each([
      ["1 character", "a"],
      ["23 characters (one short)", "64b7f0c2f1a2b3c4d5e6f70"],
      ["25 characters (one extra)", "64b7f0c2f1a2b3c4d5e6f7012"],
    ])("fails the length rule for a hex id with %s", (_label, value) => {
      expect(firstError(withField("teacherId", value))).toMatchObject({
        type: "string.length",
        path: ["teacherId"],
      });
    });

    it("runs the hex rule before the length rule", () => {
      // "xyz" is both non-hex and too short, abortEarly reports only the first
      expect(firstError(withField("teacherId", "xyz"))?.type).toBe("string.hex");
    });
  });

  // =====================================================
  describe("startTime", () => {
    it("fails with the custom message when missing", () => {
      expect(firstError(withoutField("startTime"))).toMatchObject({
        type: "any.required",
        message: "Start time is required",
        path: ["startTime"],
      });
    });

    it.each([
      ["plain text", "not a date"],
      ["an empty string", ""],
      ["only spaces", "   "],
      ["null", null],
      ["a boolean", true],
      ["an object", {}],
      ["an impossible month", "2026-13-45T00:00:00Z"],
    ])("fails with the custom message for %s", (_label, value) => {
      expect(firstError(withField("startTime", value))).toMatchObject({
        type: "date.base",
        message: "Start time must be a valid date",
        path: ["startTime"],
      });
    });
  });

  // =====================================================
  describe("endTime", () => {
    it("fails with the custom message when missing", () => {
      expect(firstError(withoutField("endTime"))).toMatchObject({
        type: "any.required",
        message: "End time is required",
        path: ["endTime"],
      });
    });

    it.each([
      ["plain text", "not a date"],
      ["an empty string", ""],
      ["null", null],
      ["a boolean", true],
    ])("fails with the custom message for %s", (_label, value) => {
      expect(firstError(withField("endTime", value))).toMatchObject({
        type: "date.base",
        message: "End time must be a valid date",
        path: ["endTime"],
      });
    });

    it("fails when endTime is before startTime", () => {
      expect(firstError(withField("endTime", "2026-11-25T09:00:00.000Z"))).toMatchObject({
        type: "date.greater",
        message: "End time must be greater than start time",
        path: ["endTime"],
      });
    });

    it("fails when endTime equals startTime (greater, not greater-or-equal)", () => {
      expect(firstError(withField("endTime", validPayload.startTime))).toMatchObject({
        type: "date.greater",
        message: "End time must be greater than start time",
        path: ["endTime"],
      });
    });

    it("fails when endTime is on an earlier day", () => {
      expect(firstError(withField("endTime", "2026-11-24T11:00:00.000Z"))?.type).toBe(
        "date.greater"
      );
    });

    it("accepts endTime just 1 millisecond after startTime", () => {
      expect(
        validate(withField("endTime", "2026-11-25T10:00:00.001Z")).error
      ).toBeUndefined();
    });

    it("accepts endTime on a later day", () => {
      expect(
        validate(withField("endTime", "2026-11-26T10:00:00.000Z")).error
      ).toBeUndefined();
    });

    it("reports the startTime error first when startTime is invalid", () => {
      expect(firstError(withField("startTime", "not a date"))).toMatchObject({
        type: "date.base",
        path: ["startTime"],
      });
    });

    it("reports the startTime error first when startTime is missing", () => {
      expect(firstError(withoutField("startTime"))).toMatchObject({
        type: "any.required",
        path: ["startTime"],
      });
    });
  });

  // =====================================================
  describe("whole payload", () => {
    it("rejects unknown fields", () => {
      expect(firstError({ ...validPayload, status: "BOOKED" })).toMatchObject({
        type: "object.unknown",
        path: ["status"],
      });
    });

    it("reports only the first error by default (abortEarly: true)", () => {
      const { error } = validate({});

      expect(error?.details).toHaveLength(1);
    });

    it("reports every missing field when abortEarly is false", () => {
      const { error } = validate({}, false);

      expect(error?.details).toHaveLength(3);
      expect(error?.details.map((d) => d.message)).toEqual(
        expect.arrayContaining([
          "Teacher id is required",
          "Start time is required",
          "End time is required",
        ])
      );
    });

    it("reports every failing rule of one field when abortEarly is false", () => {
      // "xyz" breaks both the hex rule and the length rule
      const { error } = validate(withField("teacherId", "xyz"), false);

      expect(error?.details.map((d) => d.type)).toEqual(["string.hex", "string.length"]);
    });
  });
});