import { z } from "zod";
import { Sector } from "../../domain/enums";

export const indicatorsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  targetSector: z.nativeEnum(Sector).optional(),
});

export type IndicatorsQuery = z.infer<typeof indicatorsQuerySchema>;
