/**
 * GST state codes — the first two digits of every GSTIN.
 *
 * Used to pre-fill the state during onboarding: an owner who types their
 * GSTIN has already told us where they are registered, so asking again is a
 * question we can answer ourselves.
 *
 * Codes 25 (Daman & Diu) and 28 (undivided Andhra Pradesh) are retired — no
 * GSTIN is issued against them any more, so they are deliberately absent
 * rather than offered in a picker where they would only cause wrong filings.
 */
export const GST_STATES: Readonly<Record<string, string>> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

/** Alphabetical, for a select. The code stays the value — names change, codes do not. */
export const GST_STATE_OPTIONS: ReadonlyArray<{ code: string; name: string }> = Object.entries(
  GST_STATES,
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export function stateName(code: string | null | undefined): string | null {
  if (!code) return null;
  return GST_STATES[code] ?? null;
}
