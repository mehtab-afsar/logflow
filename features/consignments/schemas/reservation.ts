import { z } from "zod";

export const reserveBlankLrSchema = z.object({
  branch_id: z.string().uuid(),
  count: z.number().int().min(1).max(50),
  reserved_date: z.iso.date().optional(),
});

export const voidReservationSchema = z.object({
  reason: z.string().min(1, "a reason is required").max(500),
});

export type ReserveBlankLrInput = z.infer<typeof reserveBlankLrSchema>;
export type VoidReservationInput = z.infer<typeof voidReservationSchema>;
