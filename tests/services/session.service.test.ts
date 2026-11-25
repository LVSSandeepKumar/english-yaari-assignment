import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { Types } from "mongoose";

// ---------- 1. Mocks (must come BEFORE importing the service) ----------
const sessionModel = {
  create: jest.fn<(...args: any[]) => any>(),
  aggregate: jest.fn<(...args: any[]) => any>(),
  findById: jest.fn<(...args: any[]) => any>(),
  updateOne: jest.fn<(...args: any[]) => any>(),
};
const teacherModel = { findById: jest.fn<(...args: any[]) => any>() };
const userModel = { findById: jest.fn<(...args: any[]) => any>() };

jest.unstable_mockModule("../../models/session.model.js", () => ({
  SessionModel: sessionModel,
  SessionStatus: { AVAILABLE: "AVAILABLE", BOOKED: "BOOKED", COMPLETED: "COMPLETED" },
}));
jest.unstable_mockModule("../../models/teacher.model.js", () => ({
  TeacherModel: teacherModel,
}));
jest.unstable_mockModule("../../models/user.model.js", () => ({
  UserModel: userModel,
}));

// ---------- 2. Import the service AFTER mocking ----------
const { createSession, findAvailableSessions, bookSession, completeSession } =
  await import("../../services/session.service.js");
const { ClientError } = await import("../../config/clientError.js");
const { getDayRange } = await import("../../utils/dateUtils.js");
const { withTeacherPipeline } = await import("../../pipelines/withTeacher.js");

// ---------- helpers ----------
const sessionId = new Types.ObjectId().toString();
const userId = new Types.ObjectId().toString();
const teacherId = new Types.ObjectId();

const HOUR = 60 * 60 * 1000;
const inFuture = (ms: number) => new Date(Date.now() + ms);
const inPast = (ms: number) => new Date(Date.now() - ms);

// Asserts the promise rejects with a ClientError carrying the expected details
const expectClientError = async (promise: Promise<unknown>, message: string, statusCode: number, errorCode: string) => {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ClientError);
  expect(err).toMatchObject({ message, statusCode, errorCode });
};

beforeEach(() => {
  // clearMocks keeps implementations, so reset them to avoid leaking between tests
  [...Object.values(sessionModel), teacherModel.findById, userModel.findById].forEach((m) => m.mockReset());
});

// =====================================================
describe("createSession", () => {
  const validPayload = () => ({
    teacherId,
    startTime: inFuture(HOUR),
    endTime: inFuture(2 * HOUR),
  });

  it("creates a session for an existing teacher with future times", async () => {
    const payload = validPayload();
    const created = { _id: sessionId, ...payload };
    teacherModel.findById.mockResolvedValue({ _id: teacherId });
    sessionModel.create.mockResolvedValue(created);

    const result = await createSession(payload);

    expect(teacherModel.findById).toHaveBeenCalledWith(teacherId);
    expect(sessionModel.create).toHaveBeenCalledWith(payload);
    expect(result).toBe(created);
  });

  it("throws 404 TEACHER_NOT_FOUND when the teacher does not exist", async () => {
    teacherModel.findById.mockResolvedValue(null);

    await expectClientError(createSession(validPayload()), "Teacher not found", 404, "TEACHER_NOT_FOUND");
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("checks the teacher before checking the times", async () => {
    teacherModel.findById.mockResolvedValue(null);

    await expectClientError(
      createSession({ teacherId, startTime: inPast(2 * HOUR), endTime: inPast(HOUR) }),
      "Teacher not found",
      404,
      "TEACHER_NOT_FOUND",
    );
  });

  it("throws 400 when startTime is in the past", async () => {
    teacherModel.findById.mockResolvedValue({ _id: teacherId });

    await expectClientError(
      createSession({ teacherId, startTime: inPast(HOUR), endTime: inFuture(HOUR) }),
      "Sessions can't be created in the past. Please choose valid time",
      400,
      "",
    );
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("throws 400 when both times are in the past", async () => {
    teacherModel.findById.mockResolvedValue({ _id: teacherId });

    await expectClientError(
      createSession({ teacherId, startTime: inPast(2 * HOUR), endTime: inPast(HOUR) }),
      "Sessions can't be created in the past. Please choose valid time",
      400,
      "",
    );
  });

  it("throws 400 INVALID_PAYLOAD when startTime is after endTime", async () => {
    teacherModel.findById.mockResolvedValue({ _id: teacherId });

    await expectClientError(
      createSession({ teacherId, startTime: inFuture(3 * HOUR), endTime: inFuture(HOUR) }),
      "End time must be greater than start time",
      400,
      "INVALID_PAYLOAD",
    );
    expect(sessionModel.create).not.toHaveBeenCalled();
  });

  it("propagates database errors from create", async () => {
    teacherModel.findById.mockResolvedValue({ _id: teacherId });
    sessionModel.create.mockRejectedValue(new Error("E11000 duplicate key"));

    await expect(createSession(validPayload())).rejects.toThrow("E11000 duplicate key");
  });
});

// =====================================================
describe("findAvailableSessions", () => {
  const timestamp = Date.UTC(2026, 10, 25, 10, 30);
  const { dayStart, dayEnd } = getDayRange(timestamp);

  it("returns whatever the aggregation returns", async () => {
    const rows = [{ _id: sessionId, teacher: { fullName: "MS Dhoni" } }];
    sessionModel.aggregate.mockResolvedValue(rows);

    const result = await findAvailableSessions(timestamp, "asc");

    expect(result).toBe(rows);
    expect(sessionModel.aggregate).toHaveBeenCalledTimes(1);
  });

  it("matches only AVAILABLE sessions inside the day range", async () => {
    sessionModel.aggregate.mockResolvedValue([]);

    await findAvailableSessions(timestamp, "asc");

    const pipeline = sessionModel.aggregate.mock.calls[0]![0] as any[];
    expect(pipeline[0]).toEqual({
      $match: { status: "AVAILABLE", startTime: { $gte: dayStart, $lt: dayEnd } },
    });
  });

  it("sorts ascending by startTime for 'asc'", async () => {
    sessionModel.aggregate.mockResolvedValue([]);

    await findAvailableSessions(timestamp, "asc");

    const pipeline = sessionModel.aggregate.mock.calls[0]![0] as any[];
    expect(pipeline[1]).toEqual({ $sort: { startTime: 1 } });
  });

  it("sorts descending by startTime for 'desc'", async () => {
    sessionModel.aggregate.mockResolvedValue([]);

    await findAvailableSessions(timestamp, "desc");

    const pipeline = sessionModel.aggregate.mock.calls[0]![0] as any[];
    expect(pipeline[1]).toEqual({ $sort: { startTime: -1 } });
  });

  it.each(["", "ASC", "DESC", "random"])("falls back to ascending for sort '%s'", async (sort) => {
    sessionModel.aggregate.mockResolvedValue([]);

    await findAvailableSessions(timestamp, sort);

    const pipeline = sessionModel.aggregate.mock.calls[0]![0] as any[];
    expect(pipeline[1]).toEqual({ $sort: { startTime: 1 } });
  });

  it("appends the withTeacher pipeline after match and sort", async () => {
    sessionModel.aggregate.mockResolvedValue([]);

    await findAvailableSessions(timestamp, "asc");

    const pipeline = sessionModel.aggregate.mock.calls[0]![0] as any[];
    expect(pipeline.slice(2)).toEqual(withTeacherPipeline);
  });

  it("accepts a timestamp in seconds and builds the same day range", async () => {
    sessionModel.aggregate.mockResolvedValue([]);

    await findAvailableSessions(timestamp / 1000, "asc");

    const pipeline = sessionModel.aggregate.mock.calls[0]![0] as any[];
    expect(pipeline[0].$match.startTime).toEqual({ $gte: dayStart, $lt: dayEnd });
  });

  it("propagates aggregation errors", async () => {
    sessionModel.aggregate.mockRejectedValue(new Error("aggregate failed"));

    await expect(findAvailableSessions(timestamp, "asc")).rejects.toThrow("aggregate failed");
  });
});

// =====================================================
describe("bookSession", () => {
  const availableSession = { _id: sessionId, status: "AVAILABLE" };

  it("books an available session for an existing user", async () => {
    const updateResult = { acknowledged: true, modifiedCount: 1 };
    userModel.findById.mockResolvedValue({ _id: userId });
    sessionModel.findById.mockResolvedValue(availableSession);
    sessionModel.updateOne.mockResolvedValue(updateResult);

    const result = await bookSession(sessionId, userId);

    expect(userModel.findById).toHaveBeenCalledWith(userId);
    expect(sessionModel.findById).toHaveBeenCalledWith(sessionId);
    expect(sessionModel.updateOne).toHaveBeenCalledWith({ _id: sessionId }, { status: "BOOKED", userId });
    expect(result).toBe(updateResult);
  });

  describe("sessionId validation", () => {
    it.each([
      ["an empty string", ""],
      ["not a valid ObjectId", "abc"],
      ["undefined", undefined],
      ["a number", 123],
      ["an object", {}],
    ])("throws 400 INVALID_PAYLOAD when sessionId is %s", async (_label, value) => {
      await expectClientError(bookSession(value as any, userId), "Invalid sessionId", 400, "INVALID_PAYLOAD");
      expect(userModel.findById).not.toHaveBeenCalled();
    });
  });

  describe("userId validation", () => {
    it.each([
      ["an empty string", ""],
      ["not a valid ObjectId", "abc"],
      ["undefined", undefined],
    ])("throws 400 INVALID_PAYLOAD when userId is %s", async (_label, value) => {
      await expectClientError(bookSession(sessionId, value as any), "Invalid userId", 400, "INVALID_PAYLOAD");
      expect(userModel.findById).not.toHaveBeenCalled();
    });

    it.each([
      ["a number", 123],
      ["an object", {}],
    ])("throws 400 INVALID_PAYLOAD when userId is %s", async (_label, value) => {
      await expectClientError(bookSession(sessionId, value as any), "Invalid userId", 400, "INVALID_PAYLOAD");
    });
  });

  it("validates sessionId before userId", async () => {
    await expectClientError(bookSession("bad", "alsobad"), "Invalid sessionId", 400, "INVALID_PAYLOAD");
  });

  it("throws 404 USER_NOT_FOUND when the user does not exist", async () => {
    userModel.findById.mockResolvedValue(null);

    await expectClientError(bookSession(sessionId, userId), "User not found", 404, "USER_NOT_FOUND");
    expect(sessionModel.findById).not.toHaveBeenCalled();
    expect(sessionModel.updateOne).not.toHaveBeenCalled();
  });

  it("throws 404 SESSION_NOT_FOUND when the session does not exist", async () => {
    userModel.findById.mockResolvedValue({ _id: userId });
    sessionModel.findById.mockResolvedValue(null);

    await expectClientError(bookSession(sessionId, userId), "Session not found", 404, "SESSION_NOT_FOUND");
    expect(sessionModel.updateOne).not.toHaveBeenCalled();
  });

  it.each(["BOOKED", "COMPLETED"])("throws 400 SESSION_NOT_AVAILABLE when the session is %s", async (status) => {
    userModel.findById.mockResolvedValue({ _id: userId });
    sessionModel.findById.mockResolvedValue({ _id: sessionId, status });

    await expectClientError(
      bookSession(sessionId, userId),
      "Sorry, the session you are trying to book is not available",
      400,
      "SESSION_NOT_AVAILABLE",
    );
    expect(sessionModel.updateOne).not.toHaveBeenCalled();
  });

  it("propagates database errors from updateOne", async () => {
    userModel.findById.mockResolvedValue({ _id: userId });
    sessionModel.findById.mockResolvedValue(availableSession);
    sessionModel.updateOne.mockRejectedValue(new Error("write failed"));

    await expect(bookSession(sessionId, userId)).rejects.toThrow("write failed");
  });
});

// =====================================================
describe("completeSession", () => {
  const bookedSession = { _id: sessionId, status: "BOOKED" };

  it("completes a booked session", async () => {
    const updateResult = { acknowledged: true, modifiedCount: 1 };
    sessionModel.findById.mockResolvedValue(bookedSession);
    sessionModel.updateOne.mockResolvedValue(updateResult);

    const result = await completeSession(sessionId);

    expect(sessionModel.findById).toHaveBeenCalledWith(sessionId);
    expect(sessionModel.updateOne).toHaveBeenCalledWith(
      { _id: sessionId },
      { status: "COMPLETED", completedAt: expect.any(Date) },
    );
    expect(result).toBe(updateResult);
  });

  it.each([
    ["an empty string", ""],
    ["not a valid ObjectId", "abc"],
    ["undefined", undefined],
    ["a number", 123],
  ])("throws 400 INVALID_PAYLOAD when sessionId is %s", async (_label, value) => {
    await expectClientError(completeSession(value as any), "Invalid sessionId", 400, "INVALID_PAYLOAD");
    expect(sessionModel.findById).not.toHaveBeenCalled();
  });

  it("throws 404 SESSION_NOT_FOUND when the session does not exist", async () => {
    sessionModel.findById.mockResolvedValue(null);

    await expectClientError(completeSession(sessionId), "Session not found", 404, "SESSION_NOT_FOUND");
    expect(sessionModel.updateOne).not.toHaveBeenCalled();
  });

  it.each(["AVAILABLE", "COMPLETED"])("throws 400 INVALID_SESSION when the session is %s", async (status) => {
    sessionModel.findById.mockResolvedValue({ _id: sessionId, status });

    await expectClientError(
      completeSession(sessionId),
      "Sorry the session you are trying to complete is either already completed or not booked yet. Please verify",
      400,
      "INVALID_SESSION",
    );
    expect(sessionModel.updateOne).not.toHaveBeenCalled();
  });

  it("propagates database errors from updateOne", async () => {
    sessionModel.findById.mockResolvedValue(bookedSession);
    sessionModel.updateOne.mockRejectedValue(new Error("write failed"));

    await expect(completeSession(sessionId)).rejects.toThrow("write failed");
  });
});
