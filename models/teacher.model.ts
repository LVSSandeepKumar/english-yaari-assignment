import { Schema, model } from "mongoose";
import type { HydratedDocument } from "mongoose";

// 1: Interface for teacher
export interface Teacher {
  fullName: String;
  email: String;
  specialization: String;
  experience: Number;
}

// 2: Schema for teacher
const teacherSchema = new Schema<Teacher>(
  {
    fullName: {
      type: String,
      required: [true, "Full Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true, // Emails must be stored in lowercase
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    specialization: {
      type: String,
      required: [true, "Specialization is required"],
      trim: true,
    },
    experience: {
      type: Number,
      min: 0,
      required: [true, "Experience is required"],
    },
  },
  { timestamps: true },
);

// 3: Model for teacher
export const TeacherModel = model<Teacher>("Teacher", teacherSchema);

// 4: Document type fetched from mongo db
export type TeacherDocument = HydratedDocument<Teacher>;
