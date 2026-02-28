const P_VALUE_E_THRESHOLD = 0.00001; // Use exact number when >= this; use scientific notation when < this.

/**
 * Format a p-value for display.
 *
 * - Values >= 0.00001 are shown as exact numbers with up to 5 decimal places (e.g. 0.05, 0.00001)
 * - Values < 0.00001 are shown in scientific notation (e.g. 2.3e-6)
 * - Handles null / undefined / NaN gracefully; 0 is shown as "0" to avoid "0e+0"
 */
export function formatPValue(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  if (value === 0) return '0';
  if (value < P_VALUE_E_THRESHOLD) {
    const s = value.toExponential(2);
    return s.replace(/\.?0+(e)/i, '$1');
  }
  // Exact number: use enough decimals to show 0.00001 (5 decimal places)
  return value.toFixed(5).replace(/\.?0+$/, '') || '0';
}
