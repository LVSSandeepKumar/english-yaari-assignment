import { TeacherModel } from "../models/teacher.model.js";
import { SessionModel, SessionStatus } from "../models/session.model.js";
import type { Session } from "../models/session.model.js";
import { getDayRange } from "../utils/dateUtils.js";

import { throwClientError } from "../utils/error/throwClientError.js";

export async function createSession(payload: Session) {
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
    {
      $lookup: {
        from: "teachers",
        localField: "teacherId",
        foreignField: "_id",
        as: "teacher",
      },
    },
    {
      $unwind: "$teacher",
    },
    {
      $project: {
        _id: 1,
        startTime: 1,
        endTime: 1,
        status: 1,
        teacher: {
          _id: "$teacher._id",
          fullName: "$teacher.fullName",
          email: "$teacher.email",
        },
      },
    },
  ]);

  return result;
}
