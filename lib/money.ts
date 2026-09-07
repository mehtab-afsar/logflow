/**
 * Rupee arithmetic. Integer paise only.
 *
 * WHY THIS FILE EXISTS: PostgREST serialises Postgres `numeric` to a JSON
 * number, which JavaScript parses as a float. `0.1 + 0.2 !== 0.3`, so freight
 * totals drift by a paisa and an accountant eventually finds it on an invoice.
 *
 * RULE: no arithmetic on a rupee value happens outside this file. lib/tax.ts
 * takes `taxableValuePaise: number` specifically so that rule cannot be
 * bypassed by accident.
 */

/** Rupees (possibly float, e.g. straight from JSON) → integer paise. */
export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) {
    throw new Error(`toPaise: expected a finite number, got ${rupees}`);
  }
  // Scale then round: 19.99 * 100 is 1998.9999999999998 in IEEE-754.
  return Math.round(rupees * 100);
}

/** Integer paise → rupees, as a number safe for display only. */
export function fromPaise(paise: number): number {
  assertPaise(paise);
  return paise / 100;
}

export function assertPaise(paise: number): void {
  if (!Number.isInteger(paise)) {
    throw new Error(`Expected integer paise, got ${paise}. Use toPaise() first.`);
  }
}

export function addPaise(...values: number[]): number {
  let sum = 0;
  for (const v of values) {
    assertPaise(v);
    sum += v;
  }
  return sum;
}

/**
 * Indian digit grouping: ₹12,34,567.89 — last three digits, then pairs.
 * Intl's en-IN locale already does this; we go through it so the grouping
 * rules stay correct rather than hand-rolling a regex.
 */
export function formatINR(paise: number, opts?: { symbol?: boolean }): string {
  assertPaise(paise);
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);

  return opts?.symbol === false ? formatted.replace(/^₹\s?/, "") : formatted;
}
