import { UserModel } from "../models/user.model.js";
import type { User } from "../models/user.model.js";

import { throwClientError } from "../utils/error/throwClientError.js";

export async function createUser(payload: User) {
  const { fullName, email, phone } = payload;
  const existingUser = await UserModel.findOne({
    email,
  });
  throwClientError(existingUser, `User with this email ${email} already exists`, 409, "EMAIL_ALREADY_EXISTS", payload);

  const result = await UserModel.create(payload);
  return result;
}
