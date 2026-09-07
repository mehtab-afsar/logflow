import { ewbDaysForDistance, ewbValidUntil, ewbRequired, EWB_THRESHOLD_PAISE } from "@/lib/india/eway-bill";
import { toPaise } from "@/lib/money";

describe("e-way bill validity days (1 day per 200km or part thereof)", () => {
  it.each([
    [0, 1], [1, 1], [199, 1], [200, 1],
    [201, 2], [400, 2], [401, 3],
    [1000, 5], [1001, 6],
  ])("%i km → %i day(s)", (km, days) => {
    expect(ewbDaysForDistance(km)).toBe(days);
  });

  it("rejects a negative distance", () => {
    expect(() => ewbDaysForDistance(-5)).toThrow(/invalid distance/i);
  });
});

describe("e-way bill expiry instant", () => {
  it("expires at midnight IST at the end of the last valid day", () => {
    // 7 Sep 2026, 10:00 IST → 04:30 UTC. 150km = 1 day → midnight IST on 8 Sep.
    const generated = new Date("2026-09-07T04:30:00.000Z");
    const until = ewbValidUntil(150, generated);
    expect(until.toISOString()).toBe("2026-09-07T18:30:00.000Z"); // = 8 Sep 00:00 IST
  });

  it("a late-evening IST generation still expires the following midnight", () => {
    // 7 Sep 2026 23:00 IST = 17:30 UTC. Still 1 day → 8 Sep midnight IST.
    const generated = new Date("2026-09-07T17:30:00.000Z");
    expect(ewbValidUntil(100, generated).toISOString()).toBe("2026-09-07T18:30:00.000Z");
  });

  it("longer distances add whole days", () => {
    const generated = new Date("2026-09-07T04:30:00.000Z");
    const oneDay = ewbValidUntil(150, generated).getTime();
    const threeDays = ewbValidUntil(500, generated).getTime();
    expect(threeDays - oneDay).toBe(2 * 24 * 60 * 60 * 1000);
  });
});

describe("e-way bill requirement threshold", () => {
  it("is ₹50,000", () => {
    expect(EWB_THRESHOLD_PAISE).toBe(toPaise(50_000));
  });
  it.each([
    [49_999, false],
    [50_000, true],
    [980_000, true],
  ])("declared ₹%i requires EWB: %s", (rupees, expected) => {
    expect(ewbRequired(toPaise(rupees))).toBe(expected);
  });
});
