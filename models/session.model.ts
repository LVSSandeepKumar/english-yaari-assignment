import { Schema, model } from "mongoose";
import type { ObjectId, HydratedDocument } from "mongoose";

export enum SessionStatus {
  AVAILABLE = "AVAILABLE",
  BOOKED = "BOOKED",
  COMPLETED = "COMPLETED",
}

// 1: Interface for sessions
export interface Session {
  teacherId: ObjectId;
  userId: ObjectId | null;
  startTime: Date;
  endTime: Date;
  status: SessionStatus;
  completedAt: Date | null;
}

// 2: Schema for session
const sessionSchema = new Schema<Session>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "Teacher",
      required: [true, "Teacher Id is required"],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    startTime: {
      type: Date,
      required: [true, "Start time is required"],
    },
    endTime: {
      type: Date,
      required: [true, "End time is required"],
      validate: {
        validator: function (this: any, value: Date) {
          return value > this.startTime;
        },
        message: "End time must be greater than start time",
      },
    },
    status: {
      type: String,
      enum: {
        values: Object.values(SessionStatus),
        message: "{VALUE} is not a valid status. Use AVAILABLE, BOOKED or COMPLETED",
      },
      default: SessionStatus.AVAILABLE,
    },
    completedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// 3: Model for Session
export const SessionModel = model<Session>("Session", sessionSchema);

// 4: Document type for mongo db
export type SessionDocument = HydratedDocument<Session>;
