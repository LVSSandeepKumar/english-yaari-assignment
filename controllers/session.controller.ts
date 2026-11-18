import type { Request, Response, NextFunction } from "express";
import { createSession } from "../services/session.service.js";

export async function createSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body;

    const result = await createSession(payload);

    res.status(201).json({
      success: true,
      message: "Session created successfully",
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
}
