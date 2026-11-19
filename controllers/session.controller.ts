import type { NextFunction, Request, Response } from "express";
import { bookSession, createSession, findAvailableSessions } from "../services/session.service.js";
import { throwClientError } from "../utils/error/throwClientError.js";

export async function createSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body;

    const result = await createSession(payload);

    res.status(201).json({
      success: true,
      message: "Session created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function findAvailableSessionsController(req: Request, res: Response, next: NextFunction) {
  try {
    let { dateTimeStamp, sort = "asc" } = req.query;

    throwClientError(
      !dateTimeStamp || !sort || isNaN(Number(dateTimeStamp)),
      "Please provide valid date time stamp and sort values",
      400,
      "INVALID_PAYLOAD",
    );

    const dateTimeStampNumber = Number(dateTimeStamp);

    const result = await findAvailableSessions(dateTimeStampNumber, sort);

    res.status(200).json({
      success: true,
      message: "Available sessions found",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function bookSessionController(req: Request, res: Response, next: NextFunction) {
  try {
    let sessionId = req.params.id;

    // Generally read from authentication session and not body for improved security
    const { userId } = req.body;

    const result = await bookSession(sessionId, userId);
    res.status(200).json({
      success: true,
      message: "Session booked successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
