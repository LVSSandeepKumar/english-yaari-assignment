import { Router } from "express";
import { createSessionController } from "../controllers/session.controller.js";
import { validate } from "../middleware/payload.validator.js";
import { sessionValidator } from "../validators/session.validator.js";

const router = Router();

router.post("/", validate(sessionValidator), createSessionController);

export default router;
