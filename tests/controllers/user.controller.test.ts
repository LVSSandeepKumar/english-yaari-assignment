
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";

// ---------- 1. Mock the service BEFORE importing the controller (ESM rule) ----------

const createUser = jest.fn<(...args: any[]) => any>();
const findUserSessions = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule("../../services/user.service.js", () => ({
  createUser,
  findUserSessions,
}));

// ---------- 2. Import AFTER mocking ----------

const {
  createUserController,
  findUserSessionsController,
} = await import("../../controllers/user.controller.js");

// ---------- helpers ----------

const makeRes = () => {
  const res = { status: jest.fn<any>(), json: jest.fn<any>() };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
};

let res: ReturnType<typeof makeRes>;
let next: jest.Mock<any>;

type Handler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

const call = (handler: Handler, req: Record<string, unknown>) =>
  handler(
    req as unknown as Request,
    res as unknown as Response,
    next as unknown as NextFunction
  );

const nextError = () => next.mock.calls[0]?.[0];

const userId = "64b7f0c2f1a2b3c4d5e6f702";

// ---------- setup ----------

beforeEach(() => {
  [createUser, findUserSessions].forEach((m) => m.mockReset());

  res = makeRes();
  next = jest.fn<any>();
});

// =====================================================

describe("createUserController", () => {
  const body = {
    fullName: "John Doe",
    email: "john@example.com",
    password: "password123",
  };

  it("passes req.body to the service", async () => {
    createUser.mockResolvedValue({});

    await call(createUserController, { body });

    expect(createUser).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith(body);
  });

  it("responds 201 with the created user", async () => {
    const created = { _id: userId, ...body };

    createUser.mockResolvedValue(created);

    await call(createUserController, { body });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "User created successfully",
      data: created,
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("forwards service errors to next()", async () => {
    const err = new Error("Failed to create user");

    createUser.mockRejectedValue(err);

    await call(createUserController, { body });

    expect(next).toHaveBeenCalledTimes(1);
    expect(nextError()).toBe(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("forwards unexpected errors to next()", async () => {
    const err = new Error("db down");

    createUser.mockRejectedValue(err);

    await call(createUserController, { body });

    expect(nextError()).toBe(err);
  });

  it("does not throw out of the handler", async () => {
    createUser.mockRejectedValue(new Error("boom"));

    await expect(
      call(createUserController, { body })
    ).resolves.toBeUndefined();
  });
});

// =====================================================

describe("findUserSessionsController", () => {
  it("passes the user id from params to the service", async () => {
    findUserSessions.mockResolvedValue({ upcoming: [], completed: [] });

    await call(findUserSessionsController, {
      params: { id: userId },
    });

    expect(findUserSessions).toHaveBeenCalledTimes(1);
    expect(findUserSessions).toHaveBeenCalledWith(userId);
  });

  it("responds 200 with the user sessions", async () => {
    const sessions = {
      upcoming: [
        { _id: "session-1", status: "UPCOMING" },
      ],
      completed: [
        { _id: "session-2", status: "COMPLETED" },
      ],
    };

    findUserSessions.mockResolvedValue(sessions);

    await call(findUserSessionsController, {
      params: { id: userId },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Found user sessions",
      data: sessions,
    });

    expect(next).not.toHaveBeenCalled();
  });

  it("responds 200 with empty arrays when user has no sessions", async () => {
    const sessions = {
      upcoming: [],
      completed: [],
    };

    findUserSessions.mockResolvedValue(sessions);

    await call(findUserSessionsController, {
      params: { id: userId },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: sessions,
      })
    );
  });

  it("forwards service errors to next()", async () => {
    const err = new Error("Failed to fetch user sessions");

    findUserSessions.mockRejectedValue(err);

    await call(findUserSessionsController, {
      params: { id: userId },
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(nextError()).toBe(err);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("forwards unexpected errors to next()", async () => {
    const err = new Error("database query failed");

    findUserSessions.mockRejectedValue(err);

    await call(findUserSessionsController, {
      params: { id: userId },
    });

    expect(nextError()).toBe(err);
  });

  it("does not throw out of the handler", async () => {
    findUserSessions.mockRejectedValue(new Error("boom"));

    await expect(
      call(findUserSessionsController, {
        params: { id: userId },
      })
    ).resolves.toBeUndefined();
  });
});
