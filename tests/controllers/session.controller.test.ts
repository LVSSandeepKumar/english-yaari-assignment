import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import { ClientError } from "../../config/clientError.js";

// ---------- 1. Mock the service BEFORE importing the controller (ESM rule) ----------
const createSession = jest.fn<(...args: any[]) => any>();
const findAvailableSessions = jest.fn<(...args: any[]) => any>();
const bookSession = jest.fn<(...args: any[]) => any>();
const completeSession = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule("../../services/session.service.js", () => ({
  createSession,
  findAvailableSessions,
  bookSession,
  completeSession,
}));

// ---------- 2. Import AFTER mocking ----------
const {
  createSessionController,
  findAvailableSessionsController,
  bookSessionController,
  completeSessionController,
} = await import("../../controllers/session.controller.js");

// ---------- helpers ----------
const makeRes = () => {
  const res = { status: jest.fn<any>(), json: jest.fn<any>() };
  res.status.mockReturnValue(res); // chainable: res.status(...).json(...)
  res.json.mockReturnValue(res);
  return res;
};

let res: ReturnType<typeof makeRes>;
let next: jest.Mock<any>;

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

const call = (handler: Handler, req: Record<string, unknown>) =>
  handler(req as unknown as Request, res as unknown as Response, next as unknown as NextFunction);

const nextError = () => next.mock.calls[0]?.[0];

const sessionId = "64b7f0c2f1a2b3c4d5e6f701";
const userId = "64b7f0c2f1a2b3c4d5e6f702";

beforeEach(() => {
  [createSession, findAvailableSessions, bookSession, completeSession].forEach((m) => m.mockReset());
  res = makeRes();
  next = jest.fn<any>();
});

// =====================================================
describe("createSessionController", () => {
  const body = {
    teacherId: "64b7f0c2f1a2b3c4d5e6f703",
    startTime: new Date("2026-11-25T10:00:00.000Z"),
    endTime: new Date("2026-11-25T11:00:00.000Z"),
  };

  it("passes req.body to the service", async () => {
    createSession.mockResolvedValue({});

    await call(createSessionController, { body });

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledWith(body);
  });

  it("responds 201 with the created session", async () => {
    const created = { _id: sessionId, ...body };
    createSession.mockResolvedValue(created);

    await call(createSessionController, { body });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Session created successfully",
      data: created,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a ClientError from the service to next() and sends no response", async () => {
    const err = new ClientError("Teacher not found", 404, "TEACHER_NOT_FOUND");
    createSession.mockRejectedValue(err);

    await call(createSessionController, { body });

    expect(next).toHaveBeenCalledTimes(1);
    expect(nextError()).toBe(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("forwards unexpected errors to next()", async () => {
    const err = new Error("db down");
    createSession.mockRejectedValue(err);

    await call(createSessionController, { body });

    expect(nextError()).toBe(err);
  });

  it("does not throw out of the handler", async () => {
    createSession.mockRejectedValue(new Error("boom"));

    await expect(call(createSessionController, { body })).resolves.toBeUndefined();
  });
});

// =====================================================
describe("findAvailableSessionsController", () => {
  const timestamp = "1795046400000";

  describe("valid queries", () => {
    beforeEach(() => {
      findAvailableSessions.mockResolvedValue([]);
    });

    it("converts the timestamp string to a number and defaults sort to 'asc'", async () => {
      await call(findAvailableSessionsController, { query: { dateTimeStamp: timestamp } });

      expect(findAvailableSessions).toHaveBeenCalledWith(1795046400000, "asc");
    });

    it("passes an explicit sort value through", async () => {
      await call(findAvailableSessionsController, {
        query: { dateTimeStamp: timestamp, sort: "desc" },
      });

      expect(findAvailableSessions).toHaveBeenCalledWith(1795046400000, "desc");
    });

    it("accepts a timestamp in seconds and does not convert it (the util does that)", async () => {
      await call(findAvailableSessionsController, { query: { dateTimeStamp: "1795046400" } });

      expect(findAvailableSessions).toHaveBeenCalledWith(1795046400, "asc");
    });

    it("passes an unknown sort value through untouched (the service falls back to ascending)", async () => {
      await call(findAvailableSessionsController, {
        query: { dateTimeStamp: timestamp, sort: "random" },
      });

      expect(findAvailableSessions).toHaveBeenCalledWith(1795046400000, "random");
    });

    it("responds 200 with the sessions", async () => {
      const rows = [{ _id: sessionId, teacher: { fullName: "MS Dhoni" } }];
      findAvailableSessions.mockResolvedValue(rows);

      await call(findAvailableSessionsController, { query: { dateTimeStamp: timestamp } });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Available sessions found",
        data: rows,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("responds 200 with an empty list when nothing is available", async () => {
      findAvailableSessions.mockResolvedValue([]);

      await call(findAvailableSessionsController, { query: { dateTimeStamp: timestamp } });

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [] }));
    });
  });

  describe("invalid queries", () => {
    it.each([
      ["dateTimeStamp is missing", {}],
      ["dateTimeStamp is an empty string", { dateTimeStamp: "" }],
      ["dateTimeStamp is text", { dateTimeStamp: "abc" }],
      ["dateTimeStamp is partly numeric", { dateTimeStamp: "12abc" }],
      ["dateTimeStamp is repeated (array)", { dateTimeStamp: ["1", "2"] }],
      ["sort is an empty string", { dateTimeStamp: timestamp, sort: "" }],
    ])("forwards a 400 INVALID_PAYLOAD ClientError when %s", async (_label, query) => {
      await call(findAvailableSessionsController, { query });

      expect(next).toHaveBeenCalledTimes(1);
      expect(nextError()).toBeInstanceOf(ClientError);
      expect(nextError()).toMatchObject({
        message: "Please provide valid date time stamp and sort values",
        statusCode: 400,
        errorCode: "INVALID_PAYLOAD",
      });
      expect(findAvailableSessions).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe("current behaviour that probably should be rejected (see notes)", () => {
    beforeEach(() => {
      findAvailableSessions.mockResolvedValue([]);
    });

    it("accepts '0' and calls the service with 0", async () => {
      await call(findAvailableSessionsController, { query: { dateTimeStamp: "0" } });

      expect(findAvailableSessions).toHaveBeenCalledWith(0, "asc");
    });

    it("accepts a whitespace-only timestamp because Number(' ') is 0", async () => {
      await call(findAvailableSessionsController, { query: { dateTimeStamp: " " } });

      expect(findAvailableSessions).toHaveBeenCalledWith(0, "asc");
    });

    it("accepts 'Infinity' because it is not NaN", async () => {
      await call(findAvailableSessionsController, { query: { dateTimeStamp: "Infinity" } });

      expect(findAvailableSessions).toHaveBeenCalledWith(Infinity, "asc");
    });
  });

  it("forwards service errors to next()", async () => {
    const err = new Error("aggregate failed");
    findAvailableSessions.mockRejectedValue(err);

    await call(findAvailableSessionsController, { query: { dateTimeStamp: timestamp } });

    expect(nextError()).toBe(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// =====================================================
describe("bookSessionController", () => {
  it("passes the session id from params and the user id from the body", async () => {
    bookSession.mockResolvedValue({});

    await call(bookSessionController, { params: { id: sessionId }, body: { userId } });

    expect(bookSession).toHaveBeenCalledTimes(1);
    expect(bookSession).toHaveBeenCalledWith(sessionId, userId);
  });

  it("responds 200 with the service result", async () => {
    const updateResult = { acknowledged: true, modifiedCount: 1 };
    bookSession.mockResolvedValue(updateResult);

    await call(bookSessionController, { params: { id: sessionId }, body: { userId } });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Session booked successfully",
      data: updateResult,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("ignores any extra fields in the body", async () => {
    bookSession.mockResolvedValue({});

    await call(bookSessionController, {
      params: { id: sessionId },
      body: { userId, status: "COMPLETED" },
    });

    expect(bookSession).toHaveBeenCalledWith(sessionId, userId);
  });

  it("passes undefined to the service when userId is missing (the service validates it)", async () => {
    bookSession.mockResolvedValue({});

    await call(bookSessionController, { params: { id: sessionId }, body: {} });

    expect(bookSession).toHaveBeenCalledWith(sessionId, undefined);
  });

  it("forwards a ClientError from the service to next()", async () => {
    const err = new ClientError("Sorry, the session you are trying to book is not available", 400, "SESSION_NOT_AVAILABLE");
    bookSession.mockRejectedValue(err);

    await call(bookSessionController, { params: { id: sessionId }, body: { userId } });

    expect(nextError()).toBe(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("forwards a TypeError to next() when req.body is undefined", async () => {
    await call(bookSessionController, { params: { id: sessionId }, body: undefined });

    expect(nextError()).toBeInstanceOf(TypeError);
    expect(bookSession).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// =====================================================
describe("completeSessionController", () => {
  it("passes only the session id from params to the service", async () => {
    completeSession.mockResolvedValue({});

    await call(completeSessionController, { params: { id: sessionId } });

    expect(completeSession).toHaveBeenCalledTimes(1);
    expect(completeSession).toHaveBeenCalledWith(sessionId);
  });

  it("responds 200 with the service result", async () => {
    const updateResult = { acknowledged: true, modifiedCount: 1 };
    completeSession.mockResolvedValue(updateResult);

    await call(completeSessionController, { params: { id: sessionId } });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Session completed successfully",
      data: updateResult,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a ClientError from the service to next()", async () => {
    const err = new ClientError("Session not found", 404, "SESSION_NOT_FOUND");
    completeSession.mockRejectedValue(err);

    await call(completeSessionController, { params: { id: sessionId } });

    expect(nextError()).toBe(err);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("forwards unexpected errors to next()", async () => {
    const err = new Error("write failed");
    completeSession.mockRejectedValue(err);

    await call(completeSessionController, { params: { id: sessionId } });

    expect(nextError()).toBe(err);
  });
});