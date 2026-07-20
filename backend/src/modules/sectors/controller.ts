import { Request, Response } from "express";
import * as sectorsService from "./service";

export async function listSectorsController(_req: Request, res: Response) {
  res.json(await sectorsService.listActiveSectors());
}
