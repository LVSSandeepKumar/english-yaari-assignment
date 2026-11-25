import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { logger } from "../helpers/logger.mock.js"; // same fake the global mapper injects

// ---------- 1. Mock mongoose BEFORE importing db.ts (ESM rule) ----------
const connect = jest.fn<(...args: any[]) => Promise<unknown>>();

jest.unstable_mockModule("mongoose", () => ({
  default: { connect },
}));

// ---------- 2. Import AFTER mocking ----------
const { connectDB } = await import("../../config/db.js");

// ---------- helpers ----------
const ORIGINAL_URI = process.env.MONGO_URI;
let exitSpy: jest.SpiedFunction<typeof process.exit>;

beforeEach(() => {
  connect.mockReset();
  // A real process.exit would kill the Jest worker, so replace it with a no-op
  exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
});

afterEach(() => {
  exitSpy.mockRestore();
  // Restore the env var so tests don't leak into each other
  if (ORIGINAL_URI === undefined) delete process.env.MONGO_URI;
  else process.env.MONGO_URI = ORIGINAL_URI;
});

// =====================================================
describe("connectDB: missing MONGO_URI", () => {
  it("throws when MONGO_URI is not set", async () => {
    delete process.env.MONGO_URI;

    await expect(connectDB()).rejects.toThrow("MONGO_URI is not defined in .env");
  });

  it("throws when MONGO_URI is an empty string", async () => {
    process.env.MONGO_URI = "";

    await expect(connectDB()).rejects.toThrow("MONGO_URI is not defined in .env");
  });

  it("does not try to connect", async () => {
    delete process.env.MONGO_URI;

    await connectDB().catch(() => undefined);

    expect(connect).not.toHaveBeenCalled();
  });

  it("throws instead of exiting the process", async () => {
    delete process.env.MONGO_URI;

    await connectDB().catch(() => undefined);

    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// =====================================================
describe("connectDB: successful connection", () => {
  const uri = "mongodb://127.0.0.1:27017/ipl";

  beforeEach(() => {
    process.env.MONGO_URI = uri;
    connect.mockResolvedValue(undefined);
  });

  it("connects once with the URI from the environment", async () => {
    await connectDB();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(uri);
  });

  it("reads the URI when called, not when the module is imported", async () => {
    process.env.MONGO_URI = "mongodb://other-host:27017/other";

    await connectDB();

    expect(connect).toHaveBeenCalledWith("mongodb://other-host:27017/other");
  });

  it("logs 'MongoDB connected'", async () => {
    await connectDB();

    expect(logger.info).toHaveBeenCalledWith("MongoDB connected");
  });

  it("resolves with undefined", async () => {
    await expect(connectDB()).resolves.toBeUndefined();
  });

  it("does not log an error or exit the process", async () => {
    await connectDB();

    expect(logger.error).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// =====================================================
describe("connectDB: failed connection", () => {
  const failure = new Error("ECONNREFUSED 127.0.0.1:27017");

  beforeEach(() => {
    process.env.MONGO_URI = "mongodb://127.0.0.1:27017/ipl";
    connect.mockRejectedValue(failure);
  });

  it("logs the error with its message and the error object", async () => {
    await connectDB();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("MongoDB connection failed:", failure);
  });

  it("exits the process with code 1", async () => {
    await connectDB();

    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does not log 'MongoDB connected'", async () => {
    await connectDB();

    expect(logger.info).not.toHaveBeenCalled();
  });

  it("does not rethrow, because the catch block swallows the error", async () => {
    await expect(connectDB()).resolves.toBeUndefined();
  });

  it("logs the error before exiting", async () => {
    const order: string[] = [];
    (logger.error as jest.Mock<any>).mockImplementation(() => order.push("log"));
    exitSpy.mockImplementation((() => {
      order.push("exit");
    }) as never);

    await connectDB();

    expect(order).toEqual(["log", "exit"]);
  });

  it("handles a non-Error rejection", async () => {
    connect.mockRejectedValue("bad auth");

    await connectDB();

    expect(logger.error).toHaveBeenCalledWith("MongoDB connection failed:", "bad auth");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});