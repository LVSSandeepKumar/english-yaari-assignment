import type { NextFunction, Request, Response } from "express";
import { createUser } from "../services/user.service.js";

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
