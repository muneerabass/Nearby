import { validatePhone, validateName, validateEmail, validatePincode, digitsOnly } from '../utils/validation';

describe('validatePhone', () => {
  it('accepts valid Indian mobile numbers', () => {
    expect(validatePhone('9876543210')).toBeUndefined();
    expect(validatePhone('6123456789')).toBeUndefined();
    // 10-digit local number (digits-only extraction)
    expect(validatePhone('7012345678')).toBeUndefined();
  });
  it('rejects empty input', () => {
    expect(validatePhone('')).toBeTruthy();
  });
  it('rejects numbers shorter than 10 digits', () => {
    expect(validatePhone('98765432')).toBeTruthy();
  });
  it('rejects numbers longer than 10 digits', () => {
    expect(validatePhone('12345678901')).toBeTruthy();
  });
  it('rejects numbers that do not start with 6-9', () => {
    expect(validatePhone('1234567890')).toBeTruthy();
    expect(validatePhone('5123456789')).toBeTruthy();
  });
});

describe('validateName', () => {
  it('accepts valid names', () => {
    expect(validateName('Rahul')).toBeUndefined();
    expect(validateName("O'Brien")).toBeUndefined();
    expect(validateName('Anne-Marie')).toBeUndefined();
  });
  it('rejects empty names', () => {
    expect(validateName('')).toBeTruthy();
    expect(validateName('   ')).toBeTruthy();
  });
  it('rejects single characters', () => {
    expect(validateName('A')).toBeTruthy();
  });
  it('rejects names with digits', () => {
    expect(validateName('User123')).toBeTruthy();
  });
});

describe('validateEmail', () => {
  it('accepts valid emails', () => {
    expect(validateEmail('user@example.com')).toBeUndefined();
  });
  it('returns undefined for empty input (email is optional)', () => {
    expect(validateEmail('')).toBeUndefined();
    expect(validateEmail('   ')).toBeUndefined();
  });
  it('rejects malformed emails', () => {
    expect(validateEmail('not-an-email')).toBeTruthy();
    expect(validateEmail('missing@domain')).toBeTruthy();
  });
});

describe('validatePincode', () => {
  it('accepts a valid 6-digit pincode', () => {
    expect(validatePincode('400001')).toBeUndefined();
  });
  it('rejects pincodes that are not 6 digits', () => {
    expect(validatePincode('4000')).toBeTruthy();
    expect(validatePincode('4000011')).toBeTruthy();
  });
  it('rejects non-numeric pincodes', () => {
    expect(validatePincode('40000A')).toBeTruthy();
  });
  it('rejects empty input', () => {
    expect(validatePincode('')).toBeTruthy();
  });
});

describe('digitsOnly', () => {
  it('strips non-digit characters', () => {
    expect(digitsOnly('+91 98765 43210')).toBe('9198765432');
  });
  it('respects the maxLength parameter', () => {
    expect(digitsOnly('12345678901234', 6)).toBe('123456');
  });
  it('defaults to maxLength 10', () => {
    expect(digitsOnly('1234567890123')).toBe('1234567890');
  });
});
