import { Schema, model } from "mongoose";
import type { HydratedDocument } from "mongoose";

// 1: Interface of user
export interface User {
  fullName: String;
  email: String;
  phone: String;
}

// 2: Schema for user
const userSchema = new Schema<User>(
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
      unique: true,
      lowercase: true, // To ensure emails are stored in lowercase
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      trim: true,
      length: [10, "Mobile number shall be 10 digits long"], // For indian mobile numbers
    },
  },
  {
    timestamps: true,
  },
);

// 3: Model for user
export const UserModel = model<User>("User", userSchema);

// 4: Document type fetched from mongo db i.e. User with updated and created at
export type UserDocument = HydratedDocument<User>;