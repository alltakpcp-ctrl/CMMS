import { WorkOrder } from "../../../types";

export interface ActionFormProps {
  workOrder: WorkOrder;
  onSuccess: (updated: WorkOrder) => void;
  onClose: () => void;
}
