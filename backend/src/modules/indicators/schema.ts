import { z } from "zod";

export const indicatorsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  targetSectorId: z.string().optional(),
});

export type IndicatorsQuery = z.infer<typeof indicatorsQuerySchema>;
