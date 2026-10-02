import { describe, expect, test } from "vitest";
import fc from "fast-check";
import { shippingFee } from "./shipping";

describe("shipping contract", () => {
  test.each([
    [0, false, 500],
    [4999, false, 500],
    [5000, false, 0],
    [5001, false, 0],
    [0, true, 800],
    [5000, true, 300],
  ] as const)("total %i, express %s costs %i", (total, express, expected) => {
    expect(shippingFee(total, express)).toBe(expected);
  });

  test("standard delivery is the default", () => {
    expect(shippingFee(0)).toBe(500);
  });

  test("all below-threshold totals follow the paid-shipping specification", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4999 }), (total) => {
        expect(shippingFee(total, false)).toBe(500);
        expect(shippingFee(total, true)).toBe(800);
      }),
      { seed: 20261002, numRuns: 500 },
    );
  });

  test("all eligible totals follow the free-shipping specification", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5000, max: 1_000_000 }), (total) => {
        expect(shippingFee(total, false)).toBe(0);
        expect(shippingFee(total, true)).toBe(300);
      }),
      { seed: 20261002, numRuns: 500 },
    );
  });
});
