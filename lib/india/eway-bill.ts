/**
 * E-way bill validity.
 *
 * Any consignment above ₹50,000 moves with an e-way bill, and the LR number
 * plus vehicle number are Part B of it — checkpost officers ask for both
 * together, which is why the LR prints them.
 *
 * Validity for regular (non over-dimensional) cargo is one day per 200 km or
 * part thereof, counted from generation. A "day" expires at midnight at the
 * end of the last day.
 */

/** Consignments at or above this declared value need an e-way bill. */
export const EWB_THRESHOLD_PAISE = 5_000_000; // ₹50,000

export function ewbDaysForDistance(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error(`ewbDaysForDistance: invalid distance ${distanceKm}`);
  }
  return Math.max(1, Math.ceil(distanceKm / 200));
}

/**
 * Expiry instant: midnight (Asia/Kolkata) at the end of the last valid day.
 * `generatedAt` is a real instant; the returned Date is also a real instant.
 */
export function ewbValidUntil(distanceKm: number, generatedAt: Date): Date {
  const days = ewbDaysForDistance(distanceKm);

  // Shift into IST to find the local calendar date, add the days, then take
  // the following midnight IST back to UTC.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(generatedAt.getTime() + IST_OFFSET_MS);
  const endOfLastDayIst = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() + days,
    0, 0, 0, 0,
  );
  return new Date(endOfLastDayIst - IST_OFFSET_MS);
}

export function ewbRequired(declaredValuePaise: number): boolean {
  return declaredValuePaise >= EWB_THRESHOLD_PAISE;
}
