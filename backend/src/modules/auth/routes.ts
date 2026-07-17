import { Router } from "express";
import { loginController, meController } from "./controller";
import { authenticate } from "../../middlewares/authenticate";
import { asyncHandler } from "../../lib/asyncHandler";

export const authRoutes = Router();

authRoutes.post("/login", asyncHandler(loginController));
authRoutes.get("/me", authenticate, asyncHandler(meController));
