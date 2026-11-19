import { Router } from "express";
import { createUserController, findUserSessionsController } from "../controllers/user.controller.js";
import { validate } from "../middleware/payload.validator.js";
import { userValidator } from "../validators/user.validator.js";

const router = Router();

router.post("/", validate(userValidator), createUserController);
router.get("/:id/sessions", findUserSessionsController);

export default router;
