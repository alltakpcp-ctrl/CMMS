import { Router } from "express";
import { Role } from "../../domain/enums";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { canReceivePartRequests } from "../../middlewares/canReceivePartRequests";
import { canPurchase } from "../../middlewares/canPurchase";
import { asyncHandler } from "../../lib/asyncHandler";
import {
  closePurchaseOrderController,
  createPurchaseOrderController,
  getPurchaseOrderController,
  listPurchaseOrdersController,
  listPurchasingController,
  rejectPartRequestController,
  reviewPurchaseOrderController,
} from "./controller";

export const purchaseOrdersRoutes = Router();

purchaseOrdersRoutes.use(authenticate);

// Montar pedido / rejeitar indicação avulsa: exige a flag canReceivePartRequests,
// não é checagem de role (ver middlewares/canReceivePartRequests.ts).
purchaseOrdersRoutes.post("/", canReceivePartRequests(), asyncHandler(createPurchaseOrderController));
purchaseOrdersRoutes.post(
  "/reject-request/:id",
  canReceivePartRequests(),
  asyncHandler(rejectPartRequestController)
);

purchaseOrdersRoutes.get("/", authorize(Role.SUPERVISOR), asyncHandler(listPurchaseOrdersController));
// Rota estática "/purchasing" precisa vir ANTES de "/:id", senão o Express
// casaria "purchasing" como :id.
purchaseOrdersRoutes.get("/purchasing", canPurchase(), asyncHandler(listPurchasingController));
purchaseOrdersRoutes.get("/:id", asyncHandler(getPurchaseOrderController));
purchaseOrdersRoutes.post(
  "/:id/review",
  authorize(Role.SUPERVISOR),
  asyncHandler(reviewPurchaseOrderController)
);
purchaseOrdersRoutes.post("/:id/close", authorize(Role.SUPERVISOR), asyncHandler(closePurchaseOrderController));
