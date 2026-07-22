import { Request, Response } from "express";
import {
  createPurchaseOrderSchema,
  rejectPartRequestSchema,
  reviewPurchaseOrderSchema,
} from "./schema";
import * as purchaseOrdersService from "./service";

export async function createPurchaseOrderController(req: Request, res: Response) {
  const input = createPurchaseOrderSchema.parse(req.body);
  res.status(201).json(await purchaseOrdersService.createPurchaseOrder(input, req.user!));
}

export async function rejectPartRequestController(req: Request, res: Response) {
  const input = rejectPartRequestSchema.parse(req.body);
  res.json(await purchaseOrdersService.rejectPartRequest(req.params.id, input));
}

export async function listPurchaseOrdersController(_req: Request, res: Response) {
  res.json(await purchaseOrdersService.listForSupervisor());
}

export async function getPurchaseOrderController(req: Request, res: Response) {
  res.json(await purchaseOrdersService.getPurchaseOrderById(req.params.id));
}

export async function reviewPurchaseOrderController(req: Request, res: Response) {
  const input = reviewPurchaseOrderSchema.parse(req.body);
  res.json(await purchaseOrdersService.reviewPurchaseOrder(req.params.id, input, req.user!));
}
