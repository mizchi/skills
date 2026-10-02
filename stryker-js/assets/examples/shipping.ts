/** Specification: nonnegative integer totals; free shipping at 5000; express adds 300. */
export function shippingFee(total: number, express = false): number {
  const base = total >= 5000 ? 0 : 500;
  return base + (express ? 300 : 0);
}
