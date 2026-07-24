import { apiRequest } from "./client";
import { Priority } from "../domain/enums";

export interface PublicOpenWorkOrder {
  number: string;
  title: string;
  description: string;
  priority: Priority;
  createdAt: string;
  targetSector: { name: string } | null;
  requester: { name: string };
}

export interface PublicWorkOrdersBoard {
  abertas: PublicOpenWorkOrder[];
  programadas: PublicOpenWorkOrder[];
}

export function getPublicWorkOrdersBoard() {
  return apiRequest<PublicWorkOrdersBoard>("/public/workorders");
}
