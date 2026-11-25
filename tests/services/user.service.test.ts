import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { Types } from "mongoose";
import { logger } from "../helpers/logger.mock.js";

// ---------- 1. Mocks (must come BEFORE importing the service) ----------
const userModel = {
  findOne: jest.fn<(...args: any[]) => any>(),
  create: jest.fn<(...args: any[]) => any>(),
};
const sessionModel = {
  aggregate: jest.fn<(...args: any[]) => any>(),
};

jest.unstable_mockModule("../../models/user.model.js", () => ({
  UserModel: userModel,
}));
jest.unstable_mockModule("../../models/session.model.js", () => ({
  SessionModel: sessionModel,
  SessionStatus: { AVAILABLE: "AVAILABLE", BOOKED: "BOOKED", COMPLETED: "COMPLETED" },
}));

// ---------- 2. Import the service AFTER mocking ----------
const { createUser, findUserSessions } = await import("../../services/user.service.js");
const { ClientError } = await import("../../config/clientError.js");
const { withTeacherPipeline } = await import("../../pipelines/withTeacher.js");

// ---------- helpers ----------
const userId = new Types.ObjectId().toString();

const payload = {
  fullName: "MS Dhoni",
  email: "thala@csk.com",
  phone: "7777777777",
};

const getPipeline = () => sessionModel.aggregate.mock.calls[0]![0] as any[];

// Asserts the promise rejects with a ClientError carrying the expected details
const expectClientError = async (
  promise: Promise<unknown>,
  expected: { message: string; statusCode: number; errorCode: string; meta?: unknown },
) => {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ClientError);
  expect(err).toMatchObject(expected);
};

beforeEach(() => {
  // clearMocks keeps implementations, so reset them to avoid leaking between tests
  userModel.findOne.mockReset();
  userModel.create.mockReset();
  sessionModel.aggregate.mockReset();
});

// =====================================================
describe("createUser", () => {
  it("creates a user when the email is not taken", async () => {
    const created = { _id: userId, ...payload };
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockResolvedValue(created);

    const result = await createUser(payload);

    expect(result).toBe(created);
    expect(userModel.create).toHaveBeenCalledTimes(1);
    expect(userModel.create).toHaveBeenCalledWith(payload);
  });

  it("looks for an existing user by email only", async () => {
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockResolvedValue({});

    await createUser(payload);

    expect(userModel.findOne).toHaveBeenCalledTimes(1);
    expect(userModel.findOne).toHaveBeenCalledWith({ email: payload.email });
  });

  it("throws 409 EMAIL_ALREADY_EXISTS when the email is already registered", async () => {
    userModel.findOne.mockResolvedValue({ _id: userId, email: payload.email });

    await expectClientError(createUser(payload), {
      message: `User with this email ${payload.email} already exists`,
      statusCode: 409,
      errorCode: "EMAIL_ALREADY_EXISTS",
    });
  });

  it("passes the payload as meta on the duplicate-email error", async () => {
    userModel.findOne.mockResolvedValue({ _id: userId });

    await expectClientError(createUser(payload), {
      message: expect.any(String) as unknown as string,
      statusCode: 409,
      errorCode: "EMAIL_ALREADY_EXISTS",
      meta: payload,
    });
  });

  it("does not create a user when the email already exists", async () => {
    userModel.findOne.mockResolvedValue({ _id: userId });

    await createUser(payload).catch(() => undefined);

    expect(userModel.create).not.toHaveBeenCalled();
  });

  it("logs entry with the payload fields", async () => {
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockResolvedValue({});

    await createUser(payload);

    expect(logger.info).toHaveBeenCalledWith("Entering create user service", payload);
  });

  it("propagates database errors from findOne and never calls create", async () => {
    userModel.findOne.mockRejectedValue(new Error("find failed"));

    await expect(createUser(payload)).rejects.toThrow("find failed");
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it("propagates database errors from create (for example a duplicate key race)", async () => {
    userModel.findOne.mockResolvedValue(null);
    userModel.create.mockRejectedValue(new Error("E11000 duplicate key"));

    await expect(createUser(payload)).rejects.toThrow("E11000 duplicate key");
  });
});

// =====================================================
describe("findUserSessions", () => {
  describe("userId validation", () => {
    it.each([
      ["an empty string", ""],
      ["not a valid ObjectId", "abc"],
      ["undefined", undefined],
      ["null", null],
      ["a number", 123],
      ["an object", {}],
    ])("throws 400 INVALID_PAYLOAD when userId is %s", async (_label, value) => {
      await expectClientError(findUserSessions(value as any), {
        message: "Invalid userId",
        statusCode: 400,
        errorCode: "INVALID_PAYLOAD",
      });
      expect(sessionModel.aggregate).not.toHaveBeenCalled();
    });
  });

  describe("result", () => {
    it("returns the single facet document, not the wrapping array", async () => {
      const facetDoc = {
        upcoming: [{ _id: "s1", status: "BOOKED" }],
        completed: [{ _id: "s2", status: "COMPLETED" }],
      };
      sessionModel.aggregate.mockResolvedValue([facetDoc]);

      const result = await findUserSessions(userId);

      expect(result).toBe(facetDoc);
      expect(sessionModel.aggregate).toHaveBeenCalledTimes(1);
    });

    it("returns empty upcoming and completed lists for a user with no sessions", async () => {
      sessionModel.aggregate.mockResolvedValue([{ upcoming: [], completed: [] }]);

      const result = await findUserSessions(userId);

      expect(result).toEqual({ upcoming: [], completed: [] });
    });

    it("returns undefined if the aggregation returns an empty array", async () => {
      // MongoDB's $facet always emits one document, so this is purely defensive
      sessionModel.aggregate.mockResolvedValue([]);

      await expect(findUserSessions(userId)).resolves.toBeUndefined();
    });

    it("propagates aggregation errors", async () => {
      sessionModel.aggregate.mockRejectedValue(new Error("aggregate failed"));

      await expect(findUserSessions(userId)).rejects.toThrow("aggregate failed");
    });
  });

  describe("pipeline", () => {
    beforeEach(() => {
      sessionModel.aggregate.mockResolvedValue([{ upcoming: [], completed: [] }]);
    });

    it("has exactly two stages: $match then $facet", async () => {
      await findUserSessions(userId);

      const pipeline = getPipeline();
      expect(pipeline).toHaveLength(2);
      expect(Object.keys(pipeline[0])).toEqual(["$match"]);
      expect(Object.keys(pipeline[1])).toEqual(["$facet"]);
    });

    it("casts userId to an ObjectId, because aggregate() does not auto-cast", async () => {
      await findUserSessions(userId);

      const { userId: matchedId } = getPipeline()[0].$match;
      expect(matchedId).toBeInstanceOf(Types.ObjectId);
      expect(matchedId.toString()).toBe(userId);
    });

    it("first matches only BOOKED and COMPLETED sessions", async () => {
      await findUserSessions(userId);

      expect(getPipeline()[0].$match.status).toEqual({ $in: ["BOOKED", "COMPLETED"] });
    });

    it("facets into exactly 'upcoming' and 'completed'", async () => {
      await findUserSessions(userId);

      expect(Object.keys(getPipeline()[1].$facet).sort()).toEqual(["completed", "upcoming"]);
    });

    it("builds 'upcoming' from BOOKED sessions sorted by earliest startTime, with teacher details", async () => {
      await findUserSessions(userId);

      expect(getPipeline()[1].$facet.upcoming).toEqual([
        { $match: { status: "BOOKED" } },
        { $sort: { startTime: 1 } },
        ...withTeacherPipeline,
      ]);
    });

    it("builds 'completed' from COMPLETED sessions sorted by startTime, with teacher details", async () => {
      await findUserSessions(userId);

      expect(getPipeline()[1].$facet.completed).toEqual([
        { $match: { status: "COMPLETED" } },
        { $sort: { startTime: 1 } },
        ...withTeacherPipeline,
      ]);
    });

    it("builds a fresh pipeline for each call with the right user", async () => {
      const otherUserId = new Types.ObjectId().toString();

      await findUserSessions(userId);
      await findUserSessions(otherUserId);

      const second = sessionModel.aggregate.mock.calls[1]![0] as any[];
      expect(second[0].$match.userId.toString()).toBe(otherUserId);
    });
  });

  it("logs entry with the userId", async () => {
    sessionModel.aggregate.mockResolvedValue([{ upcoming: [], completed: [] }]);

    await findUserSessions(userId);

    expect(logger.info).toHaveBeenCalledWith("Entering find user sessions service", { userId });
  });
});
