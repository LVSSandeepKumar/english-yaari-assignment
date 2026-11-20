import { describe, it, expect } from "@jest/globals";
import { userValidator } from "../../validators/user.validator.js";

type Payload = Record<string, unknown>;

// Thala's jersey number as the phone number (starts with 7, so it's a valid Indian mobile)
const validPayload = {
  fullName: "John Doe",
  email: "john@doe.com",
  phone: "9876543210",
};

// ---------- helpers ----------
const validate = (payload: Payload, abortEarly = true) =>
  userValidator.validate(payload, { abortEarly });

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

describe("userValidator", () => {
  // =====================================================
  describe("valid payloads", () => {
    it("accepts a fully valid payload and returns it unchanged", () => {
      const { error, value } = validate(validPayload);

      expect(error).toBeUndefined();
      expect(value).toEqual(validPayload);
    });

    it("trims fullName, email and phone", () => {
      const { error, value } = validate({
        fullName: "  John Doe  ",
        email: "  john@doe.com  ",
        phone: "  9876543210  ",
      });

      expect(error).toBeUndefined();
      expect(value).toEqual(validPayload);
    });

    it("lowercases the email", () => {
      const { error, value } = validate(withField("email", "JOHN@DOE.COM"));

      expect(error).toBeUndefined();
      expect(value.email).toBe("john@doe.com");
    });
  });

  // =====================================================
  describe("fullName", () => {
    it("fails with the custom message when missing", () => {
      expect(firstError(withoutField("fullName"))).toMatchObject({
        type: "any.required",
        message: "Full Name is required",
        path: ["fullName"],
      });
    });

    it.each([
      ["an empty string", ""],
      ["only spaces", "   "],
      ["only tabs and newlines", "\t\n"],
    ])("fails with the custom message for %s", (_label, value) => {
      expect(firstError(withField("fullName", value))).toMatchObject({
        type: "string.empty",
        message: "Full Name is required",
        path: ["fullName"],
      });
    });

    it.each([
      ["null", null],
      ["a number", 123],
      ["a boolean", true],
      ["an object", {}],
    ])("rejects %s (not a string)", (_label, value) => {
      expect(firstError(withField("fullName", value))).toMatchObject({
        type: "string.base",
        path: ["fullName"],
      });
    });

    it("accepts names with dots, hyphens and non-English characters", () => {
      for (const name of ["Dr. A.P.J. Abdul Kalam", "Mary-Jane", "தல தோனி"]) {
        expect(validate(withField("fullName", name)).error).toBeUndefined();
      }
    });
  });

  // =====================================================
  describe("email", () => {
    it("fails with the custom message when missing", () => {
      expect(firstError(withoutField("email"))).toMatchObject({
        type: "any.required",
        message: "Email is required",
        path: ["email"],
      });
    });

    it.each([
      ["an empty string", ""],
      ["only spaces", "   "],
    ])("fails with the custom message for %s", (_label, value) => {
      expect(firstError(withField("email", value))).toMatchObject({
        type: "string.empty",
        message: "Email is required",
        path: ["email"],
      });
    });

    it.each([
      ["no @ symbol", "janedoe.com"],
      ["no domain", "john@"],
      ["no local part", "@doe.com"],
      ["a space inside", "jo hn@doe.com"],
      ["plain text", "plainaddress"],
    ])("fails with the custom message for an email with %s", (_label, value) => {
      expect(firstError(withField("email", value))).toMatchObject({
        type: "string.email",
        message: "Please enter a valid email",
        path: ["email"],
      });
    });

    it.each([
      ["null", null],
      ["a number", 123],
    ])("rejects %s (not a string)", (_label, value) => {
      expect(firstError(withField("email", value))).toMatchObject({
        type: "string.base",
        path: ["email"],
      });
    });

    it.each([
      ["a plus tag", "john+john@doe.com"],
      ["a subdomain", "john@john.doe.co.in"],
      ["a dot in the local part", "john.doe@email.com"],
    ])("accepts an email with %s", (_label, value) => {
      expect(validate(withField("email", value)).error).toBeUndefined();
    });

    it("accepts any TLD because tlds.allow is false", () => {
      expect(validate(withField("email", "thala@csk.notarealtld")).error).toBeUndefined();
    });
  });

  // =====================================================
  describe("phone", () => {
    it("fails with the custom message when missing", () => {
      expect(firstError(withoutField("phone"))).toMatchObject({
        type: "any.required",
        message: "Phone is required",
        path: ["phone"],
      });
    });

    it.each([
      ["an empty string", ""],
      ["only spaces", "   "],
    ])("fails with the custom message for %s", (_label, value) => {
      expect(firstError(withField("phone", value))).toMatchObject({
        type: "string.empty",
        message: "Phone is required",
        path: ["phone"],
      });
    });

    it.each([
      ["5 digits", "98765"],
      ["9 digits (one short)", "987654321"],
      ["11 digits (one extra)", "98765432101"],
      ["a +91 prefix", "+919876543210"],
      ["a leading zero (11 chars)", "09876543210"],
    ])("fails the length rule for %s", (_label, value) => {
      expect(firstError(withField("phone", value))).toMatchObject({
        type: "string.length",
        message: "Mobile number shall be 10 digits long",
        path: ["phone"],
      });
    });

    it.each([
      ["starts with 1", "1234567890"],
      ["starts with 0", "0987654321"],
      ["starts with 5 (just below the valid range)", "5999999999"],
      ["contains letters", "9876abcd12"],
      ["contains a space", "98765 4321"],
      ["contains a hyphen", "98765-4321"],
    ])("fails the Indian-mobile pattern when it %s", (_label, value) => {
      expect(firstError(withField("phone", value))).toMatchObject({
        type: "string.pattern.base",
        message: "Please enter a valid Indian mobile number",
        path: ["phone"],
      });
    });

    it.each(["6000000000", "7000000000", "8000000000", "9000000000", "9876543210"])(
      "accepts %s (starts with 6, 7, 8 or 9)",
      (value) => {
        expect(validate(withField("phone", value)).error).toBeUndefined();
      }
    );

    it.each([
      ["a number", 9876543210],
      ["null", null],
    ])("rejects %s (Joi does not convert it to a string)", (_label, value) => {
      expect(firstError(withField("phone", value))).toMatchObject({
        type: "string.base",
        path: ["phone"],
      });
    });
  });

  // =====================================================
  describe("whole payload", () => {
    it("rejects unknown fields", () => {
      expect(firstError({ ...validPayload, role: "admin" })).toMatchObject({
        type: "object.unknown",
        path: ["role"],
      });
    });

    it("reports only the first error by default (abortEarly: true)", () => {
      const { error } = validate({});

      expect(error?.details).toHaveLength(1);
    });

    it("reports every error when abortEarly is false", () => {
      const { error } = validate({}, false);

      expect(error?.details.map((d) => d.message)).toEqual([
        "Full Name is required",
        "Email is required",
        "Phone is required",
      ]);
    });

    it("reports one error per invalid field", () => {
      const { error } = validate(
        { fullName: "", email: "not-an-email", phone: "12345" },
        false
      );

      expect(error?.details.map((d) => d.message)).toEqual([
        "Full Name is required",
        "Please enter a valid email",
        "Mobile number shall be 10 digits long",
        "Please enter a valid Indian mobile number"
      ]);
    });
  });
});