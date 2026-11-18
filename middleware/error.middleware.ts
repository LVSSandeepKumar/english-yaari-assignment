import type { NextFunction, Request, Response } from "express";
import { ClientError } from "../config/clientError.js";

export function errorMiddleware(err: Error, req: Request, res: Response, next: NextFunction) {
  // If known client error, throw custom status code and message
  if (err instanceof ClientError && err.isClientError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errorCode: err.errorCode || "",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
    errorCode: "INTERNAL_SERVER_ERROR",
  });
}
