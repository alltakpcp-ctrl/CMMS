import { Router } from "express";
import { Role } from "../../domain/enums";
import {
  changePasswordController,
  createUserController,
  listUsersController,
  updateUserController,
} from "./controller";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";

export const usersRoutes = Router();

usersRoutes.use(authenticate, authorize(Role.SUPERVISOR));

usersRoutes.get("/", asyncHandler(listUsersController));
usersRoutes.post("/", asyncHandler(createUserController));
usersRoutes.put("/:id", asyncHandler(updateUserController));
usersRoutes.post("/:id/senha", asyncHandler(changePasswordController));
