import { describe, it, expect } from "@jest/globals";
import { getDayRange } from "../../utils/dateUtils.js";   // plain static import now

const timestampMs = Date.UTC(2026, 10, 20, 10, 30, 0);
const timestampSeconds = timestampMs / 1000;
const expectedStart = new Date(Date.UTC(2026, 10, 20));
const expectedEnd = new Date(Date.UTC(2026, 10, 21));

describe("getDayRange", () => {
  it("handles a timestamp in milliseconds", () => {
    const { dayStart, dayEnd } = getDayRange(timestampMs);
    expect(dayStart).toEqual(expectedStart);
    expect(dayEnd).toEqual(expectedEnd);
  });

  it("handles a timestamp in seconds", () => {
    const { dayStart, dayEnd } = getDayRange(timestampSeconds);
    expect(dayStart).toEqual(expectedStart);
    expect(dayEnd).toEqual(expectedEnd);
  });
});