import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { authRoutes } from "./modules/auth/routes";
import { usersRoutes } from "./modules/users/routes";
import { assetsRoutes } from "./modules/assets/routes";
import { partsRoutes } from "./modules/parts/routes";
import { workOrdersRoutes } from "./modules/workorders/routes";
import { publicWorkOrdersRoutes } from "./modules/workorders/publicRoutes";
import { indicatorsRoutes } from "./modules/indicators/routes";
import { sectorsRoutes } from "./modules/sectors/routes";
import { shiftsRoutes } from "./modules/shifts/routes";
import { partRequestsRoutes } from "./modules/part-requests/routes";
import { purchaseOrdersRoutes } from "./modules/purchase-orders/routes";
import { stockRoutes } from "./modules/stock/routes";
import { subtaskNestedRoutes, subtaskRoutes } from "./modules/subtasks/routes";
import { maintenancePlansRoutes } from "./modules/maintenance-plans/routes";
import { errorHandler } from "./middlewares/errorHandler";

export const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Rota pública (sem authenticate) — quadro de novas solicitações na tela de
// login. Montada antes dos routers protegidos; nenhum middleware global de
// auth existe em app.ts (cada módulo aplica authenticate no próprio router).
app.use("/public/workorders", publicWorkOrdersRoutes);

app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/assets", assetsRoutes);
app.use("/parts", partsRoutes);
app.use("/workorders", workOrdersRoutes);
app.use("/workorders", subtaskNestedRoutes);
app.use("/indicators", indicatorsRoutes);
app.use("/sectors", sectorsRoutes);
app.use("/shifts", shiftsRoutes);
app.use("/part-requests", partRequestsRoutes);
app.use("/purchase-orders", purchaseOrdersRoutes);
app.use("/stock", stockRoutes);
app.use("/subtasks", subtaskRoutes);
app.use("/maintenance-plans", maintenancePlansRoutes);

app.use(errorHandler);
