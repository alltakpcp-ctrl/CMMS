import { Router } from "express";
import { authenticate } from "../../middlewares/authenticate";
import { asyncHandler } from "../../lib/asyncHandler";
import { listSectorsController } from "./controller";

export const sectorsRoutes = Router();

sectorsRoutes.use(authenticate);

sectorsRoutes.get("/", asyncHandler(listSectorsController));
