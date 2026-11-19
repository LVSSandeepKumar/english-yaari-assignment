import { Router } from "express";
import {
  bookSessionController,
  createSessionController,
  findAvailableSessionsController,
} from "../controllers/session.controller.js";
import { validate } from "../middleware/payload.validator.js";
import { sessionValidator } from "../validators/session.validator.js";

const router = Router();

router.post("/", validate(sessionValidator), createSessionController);
router.get("/available", findAvailableSessionsController);
router.post("/:id/book", bookSessionController);

export default router;
