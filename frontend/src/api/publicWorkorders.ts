import { apiRequest } from "./client";
import { Disciplina, Priority } from "../domain/enums";

export interface PublicOpenWorkOrder {
  number: string;
  title: string;
  description: string;
  priority: Priority;
  disciplina: Disciplina;
  createdAt: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  targetSector: { name: string } | null;
  requester: { name: string };
  assignedTo: { name: string } | null;
  asset: { name: string };
}

export interface PublicWorkOrdersBoard {
  abertas: PublicOpenWorkOrder[];
  programadas: PublicOpenWorkOrder[];
}

export function getPublicWorkOrdersBoard() {
  return apiRequest<PublicWorkOrdersBoard>("/public/workorders");
}
