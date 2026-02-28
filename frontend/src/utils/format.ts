/**
 * Format a p-value for display.
 *
 * - Values < 0.0001 are shown in scientific notation (e.g. 2.3e-6)
 * - Values >= 0.0001 are shown with 4 decimal places (e.g. 0.0234)
 * - Handles null / undefined / NaN gracefully
 */
export function formatPValue(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  if (value < 0.0001) {
    // ToPrecision gives e.g. "2.30e-6"; clean up trailing zeros in mantissa
    const s = value.toExponential(2);
    return s.replace(/\.?0+(e)/, '$1');
  }
  return value.toFixed(4);
}
