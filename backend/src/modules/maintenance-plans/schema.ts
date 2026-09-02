import { z } from "zod";
import { MaintenanceDiscipline, MaintenancePeriodicity, Priority } from "../../domain/enums";

export const createMaintenancePlanSchema = z.object({
  assetId: z.string().min(1, "Ativo é obrigatório."),
  discipline: z.nativeEnum(MaintenanceDiscipline),
  title: z.string().min(1, "Título é obrigatório."),
  description: z.string().min(1).optional(),
  priority: z.nativeEnum(Priority),
  periodicity: z.nativeEnum(MaintenancePeriodicity),
  estimatedMinutes: z.number().int().positive().optional(),
  responsible: z.string().min(1).optional(),
  action01: z.string().min(1).optional(),
  action02: z.string().min(1).optional(),
  action03: z.string().min(1).optional(),
  action04: z.string().min(1).optional(),
  action05: z.string().min(1).optional(),
  action06: z.string().min(1).optional(),
});

export const updateMaintenancePlanSchema = createMaintenancePlanSchema.partial().extend({
  active: z.boolean().optional(),
});

export const listMaintenancePlansQuerySchema = z.object({
  assetId: z.string().optional(),
  discipline: z.nativeEnum(MaintenanceDiscipline).optional(),
  priority: z.nativeEnum(Priority).optional(),
  active: z.coerce.boolean().optional(),
});

export type CreateMaintenancePlanInput = z.infer<typeof createMaintenancePlanSchema>;
export type UpdateMaintenancePlanInput = z.infer<typeof updateMaintenancePlanSchema>;
export type ListMaintenancePlansQuery = z.infer<typeof listMaintenancePlansQuerySchema>;
