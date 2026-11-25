import { formatPrice, formatPriceCompact, paiseToRupees, rupeesToPaise } from '../utils/price';

describe('paiseToRupees', () => {
  it('converts 100 paise to 1 rupee', () => {
    expect(paiseToRupees(100)).toBe(1);
  });
  it('converts 0 paise', () => {
    expect(paiseToRupees(0)).toBe(0);
  });
  it('converts 9999 paise to 99.99 rupees', () => {
    expect(paiseToRupees(9999)).toBeCloseTo(99.99);
  });
});

describe('rupeesToPaise', () => {
  it('converts 1 rupee to 100 paise', () => {
    expect(rupeesToPaise(1)).toBe(100);
  });
  it('rounds fractional paise', () => {
    expect(rupeesToPaise(0.999)).toBe(100);
    expect(rupeesToPaise(0.001)).toBe(0);
  });
});

describe('formatPrice', () => {
  it('shows the rupee symbol', () => {
    expect(formatPrice(100)).toContain('₹');
  });
  it('formats 10000 paise as ₹100.00', () => {
    expect(formatPrice(10000)).toBe('₹100.00');
  });
  it('formats 0 paise as ₹0.00', () => {
    expect(formatPrice(0)).toBe('₹0.00');
  });
  it('formats negative paise with a leading minus', () => {
    expect(formatPrice(-100)).toMatch(/^-₹/);
  });
});

describe('formatPriceCompact', () => {
  it('omits decimal for whole rupees', () => {
    expect(formatPriceCompact(50000)).toBe('₹500');
  });
  it('includes decimal for fractional rupees', () => {
    expect(formatPriceCompact(5050)).toContain('50.50');
  });
});
