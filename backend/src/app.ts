import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { authRoutes } from "./modules/auth/routes";
import { usersRoutes } from "./modules/users/routes";
import { assetsRoutes } from "./modules/assets/routes";
import { partsRoutes } from "./modules/parts/routes";
import { workOrdersRoutes } from "./modules/workorders/routes";
import { indicatorsRoutes } from "./modules/indicators/routes";
import { errorHandler } from "./middlewares/errorHandler";

export const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/assets", assetsRoutes);
app.use("/parts", partsRoutes);
app.use("/workorders", workOrdersRoutes);
app.use("/indicators", indicatorsRoutes);

app.use(errorHandler);
