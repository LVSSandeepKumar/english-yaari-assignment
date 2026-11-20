import { Types } from "mongoose";
import type { Session } from "../models/session.model.js";
import { SessionModel, SessionStatus } from "../models/session.model.js";
import { TeacherModel } from "../models/teacher.model.js";
import { UserModel } from "../models/user.model.js";

import { throwClientError } from "../utils/error/throwClientError.js";
import { getDayRange } from "../utils/dateUtils.js";

import { withTeacherPipeline } from "../pipelines/withTeacher.js";
import { logger } from "../utils/logger/logger.js";

type CreateSessionPayload = Pick<Session, "teacherId" | "startTime" | "endTime">;
export async function createSession(payload: CreateSessionPayload) {
  logger.info("Entering create session service", payload);
  const { teacherId, startTime, endTime } = payload;

  const now = new Date();

  const existingTeacher = await TeacherModel.findById(teacherId);
  throwClientError(!existingTeacher, "Teacher not found", 404, "TEACHER_NOT_FOUND");
  // Ensure sessions are created for future only and end time is greater than start time
  throwClientError(startTime < now || endTime < now, "Sessions can't be created in the past. Please choose valid time");
  throwClientError(startTime > endTime, "End time must be greater than start time", 400, "INVALID_PAYLOAD");

  const result = await SessionModel.create(payload);
  return result;
}

export async function findAvailableSessions(dateTimeStamp: number, sort: string) {
  logger.info("Entering find available sessions service", { dateTimeStamp, sort });
  const { dayStart, dayEnd } = getDayRange(dateTimeStamp);
  const sortValue = sort === "desc" ? -1 : 1;

  const result = await SessionModel.aggregate([
    {
      $match: {
        status: SessionStatus.AVAILABLE,
        startTime: { $gte: dayStart, $lte: dayEnd },
      },
    },
    {
      $sort: {
        startTime: sortValue,
      },
    },
    ...withTeacherPipeline,
  ]);

  return result;
}

export async function bookSession(sessionId: string, userId: string) {
  logger.info("Entering book session service", { sessionId, userId });
  throwClientError(
    !sessionId || typeof sessionId !== "string" || !Types.ObjectId.isValid(sessionId),
    "Invalid sessionId",
    400,
    "INVALID_PAYLOAD",
  );
  throwClientError(
    !userId || typeof sessionId !== "string" || !Types.ObjectId.isValid(userId),
    "Invalid userId",
    400,
    "INVALID_PAYLOAD",
  );

  const existingUser = await UserModel.findById(userId);
  throwClientError(!existingUser, "User not found", 404, "USER_NOT_FOUND");

  const existingSession = await SessionModel.findById(sessionId);
  throwClientError(!existingSession, "Session not found", 404, "SESSION_NOT_FOUND");

  throwClientError(
    existingSession?.status !== "AVAILABLE",
    "Sorry, the session you are trying to book is not available",
    400,
    "SESSION_NOT_AVAILABLE",
  );

  const result = await SessionModel.updateOne({ _id: sessionId }, { status: "BOOKED", userId });
  return result;
}

export async function completeSession(sessionId: string) {
  logger.info("Entering complete session service", { sessionId });
  throwClientError(
    !sessionId || typeof sessionId !== "string" || !Types.ObjectId.isValid(sessionId),
    "Invalid sessionId",
    400,
    "INVALID_PAYLOAD",
  );

  const existingSession = await SessionModel.findById(sessionId);
  throwClientError(!existingSession, "Session not found", 404, "SESSION_NOT_FOUND");

  throwClientError(
    existingSession?.status !== "BOOKED",
    "Sorry the session you are trying to complete is either already completed or not booked yet. Please verify",
    400,
    "INVALID_SESSION",
  );

  const result = await SessionModel.updateOne({ _id: sessionId }, { status: "COMPLETED" });
  return result;
}
