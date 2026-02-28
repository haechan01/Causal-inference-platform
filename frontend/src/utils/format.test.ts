import { formatPValue } from './format';

describe('formatPValue', () => {
  describe('null / undefined / NaN inputs', () => {
    it('returns an em-dash for null', () => {
      expect(formatPValue(null)).toBe('—');
    });

    it('returns an em-dash for undefined', () => {
      expect(formatPValue(undefined)).toBe('—');
    });

    it('returns an em-dash for NaN', () => {
      expect(formatPValue(NaN)).toBe('—');
    });
  });

  describe('values < 0.00001 (scientific notation)', () => {
    it('formats a very small p-value in scientific notation', () => {
      const result = formatPValue(0.000001);
      expect(result).toMatch(/e/i);
    });

    it('formats p < 0.00001 without trailing zeros in mantissa', () => {
      const result = formatPValue(9.9e-7);
      expect(result).toMatch(/e/i);
      expect(result).not.toMatch(/\.0+e/i);
    });

    it('handles exactly 1e-10', () => {
      const result = formatPValue(1e-10);
      expect(result).toMatch(/e/i);
    });
  });

  describe('values >= 0.00001 (exact number, no e)', () => {
    it('formats 0.05 as exact number', () => {
      expect(formatPValue(0.05)).toBe('0.05');
    });

    it('formats 0.0001 as exact number', () => {
      expect(formatPValue(0.0001)).toBe('0.0001');
    });

    it('formats 0.00001 (boundary) as exact number', () => {
      expect(formatPValue(0.00001)).toBe('0.00001');
    });

    it('formats 0.0234 as exact number', () => {
      expect(formatPValue(0.0234)).toBe('0.0234');
    });

    it('formats 1.0 as exact number', () => {
      expect(formatPValue(1.0)).toBe('1');
    });

    it('formats 0 as "0" (avoids 0e+0)', () => {
      expect(formatPValue(0.0)).toBe('0');
    });

    it('formats a typical p-value of 0.0432 correctly', () => {
      expect(formatPValue(0.0432)).toBe('0.0432');
    });
  });
});
