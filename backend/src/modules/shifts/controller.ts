import { Request, Response } from "express";
import * as shiftsService from "./service";

export async function listShiftsController(_req: Request, res: Response) {
  res.json(await shiftsService.listActiveShifts());
}
