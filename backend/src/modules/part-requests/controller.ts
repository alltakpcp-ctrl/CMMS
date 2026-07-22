import { Request, Response } from "express";
import { assertCanReceivePartRequests } from "../../middlewares/canReceivePartRequests";
import { createPartRequestSchema, listPartRequestsQuerySchema } from "./schema";
import * as partRequestsService from "./service";

export async function createPartRequestController(req: Request, res: Response) {
  const input = createPartRequestSchema.parse(req.body);
  res.status(201).json(await partRequestsService.createPartRequest(input, req.user!));
}

export async function listPartRequestsController(req: Request, res: Response) {
  const query = listPartRequestsQuerySchema.parse(req.query);

  if (query.scope === "pending") {
    await assertCanReceivePartRequests(req.user!.userId);
    res.json(await partRequestsService.listPending());
    return;
  }

  res.json(await partRequestsService.listMine(req.user!.userId));
}

export async function getPartRequestController(req: Request, res: Response) {
  res.json(await partRequestsService.getPartRequestById(req.params.id));
}
