import Joi from "joi";

export const sessionValidator = Joi.object({
  teacherId: Joi.string().hex().length(24).required().messages({
    "any.required": "Teacher id is required",
  }),
  startTime: Joi.date().required().messages({
    "any.required": "Start time is required",
    "date.base": "Start time must be a valid date",
  }),
  endTime: Joi.date().greater(Joi.ref("startTime")).required().messages({
    "any.required": "End time is required",
    "date.base": "End time must be a valid date",
    "date.greater": "End time must be greater than start time",
  }),
});
