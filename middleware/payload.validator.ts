import type { Request, Response, NextFunction } from "express";
import type Joi from "joi";
import { ClientError } from "../config/clientError.js";

export const validate = (schema: Joi.ObjectSchema) => {
  return function (req: Request, res: Response, next: NextFunction) {
    const { error, value } = schema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const mainError = error.details[0];
      return next(new ClientError(mainError.message, 400, "VALIDATION_FAILED"));
    }

    req.body = value;
    next();
  };
};
