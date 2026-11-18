import { TeacherModel } from "../models/teacher.model.js";
import { SessionModel } from "../models/session.model.js";
import type { Session } from "../models/session.model.js";

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
