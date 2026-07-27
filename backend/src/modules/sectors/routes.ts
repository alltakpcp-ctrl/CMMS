import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  createSectorController,
  deleteSectorController,
  listSectorsController,
  updateSectorController,
} from "./controller";

export const sectorsRoutes = Router();

sectorsRoutes.use(authenticate);

sectorsRoutes.get("/", asyncHandler(listSectorsController));
sectorsRoutes.post("/", authorize(Role.SUPERVISOR), asyncHandler(createSectorController));
sectorsRoutes.put("/:id", authorize(Role.SUPERVISOR), asyncHandler(updateSectorController));
sectorsRoutes.delete("/:id", authorize(Role.SUPERVISOR), asyncHandler(deleteSectorController));
