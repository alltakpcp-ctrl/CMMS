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

export function getPublicOpenWorkOrders() {
  return apiRequest<PublicOpenWorkOrder[]>("/public/workorders");
}
