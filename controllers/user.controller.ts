import type { NextFunction, Request, Response } from "express";
import { createUser, findUserSessions } from "../services/user.service.js";

export async function createUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body;

    const result = await createUser(payload);

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
}

export async function findUserSessionsController(req: Request, res: Response, next: NextFunction) {
  try {
    let userId = req.params.id;

    const result = await findUserSessions(userId);
    res.status(200).json({
      success: true,
      message: "Found user sessions",
      data: result, // { upcoming, completed }
    });
  } catch (error) {
    next(error);
  }
}
