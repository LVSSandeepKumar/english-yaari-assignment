import { Types } from "mongoose";
import { UserModel } from "../models/user.model.js";
import type { User } from "../models/user.model.js";
import { SessionModel, SessionStatus } from "../models/session.model.js";

import { throwClientError } from "../utils/error/throwClientError.js";

import { withTeacherPipeline } from "../pipelines/withTeacher.js";
import { logger } from "../utils/logger/logger.js";

export async function createUser(payload: User) {
  logger.info("Entering create user service", { ...payload }); // {...payload} instead of payload to avoid type errors
  const { fullName, email, phone } = payload;
  const existingUser = await UserModel.findOne({
    email,
  });
  throwClientError(existingUser, `User with this email ${email} already exists`, 409, "EMAIL_ALREADY_EXISTS", payload);

  try {
    const result = await UserModel.create(payload);
    return result;
  } catch (err: any) {
    throwClientError(err?.code === 11000, `User with this email ${email} already exists`, 409, "EMAIL_ALREADY_EXISTS");
    throw err;
  }
}

export async function findUserSessions(userId: string) {
  logger.info("Entering find user sessions service", { userId });
  throwClientError(
    !userId || typeof userId !== "string" || !Types.ObjectId.isValid(userId),
    "Invalid userId",
    400,
    "INVALID_PAYLOAD",
  );

  // [result] bcoz facet always gives one object only, so destructuirng will give us the one object
  const [result] = await SessionModel.aggregate([
    {
      $match: {
        userId: new Types.ObjectId(userId), // Bcoz find operations can convert string to objectId but aggregate operations can't.
        status: { $in: [SessionStatus.BOOKED, SessionStatus.COMPLETED] },
      },
    },
    {
      $facet: {
        upcoming: [{ $match: { status: SessionStatus.BOOKED } }, { $sort: { startTime: 1 } }, ...withTeacherPipeline],
        completed: [
          { $match: { status: SessionStatus.COMPLETED } },
          { $sort: { startTime: 1 } },
          ...withTeacherPipeline,
        ],
      },
    },
  ]);

  return result;
}
