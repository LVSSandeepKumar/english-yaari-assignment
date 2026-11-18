import Joi from "joi";

export const userValidator = Joi.object({
  fullName: Joi.string().trim().required().messages({
    "string.empty": "Full Name is required",
    "any.required": "Full Name is required",
  }),
  email: Joi.string()
    .lowercase()
    .trim()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      "string.empty": "Email is required",
      "any.required": "Email is required",
      "string.email": "Please enter a valid email",
    }),
  phone: Joi.string()
    .trim()
    .length(10)
    .pattern(/^[6-9]\d{9}$/)
    .required()
    .messages({
      "string.empty": "Phone is required",
      "string.length": "Mobile number shall be 10 digits long",
      "string.pattern.base": "Please enter a valid Indian mobile number",
      "any.required": "Phone is required",
    }),
});
