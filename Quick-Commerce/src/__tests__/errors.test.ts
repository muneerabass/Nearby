import { getErrorMessage, isNetworkError } from '../utils/errors';
import { ApiError } from '../services/apiClient';

describe('getErrorMessage', () => {
  it('returns the message from an ApiError', () => {
    const err = new ApiError({ message: 'Not found', status: 404, code: 'not_found' });
    expect(getErrorMessage(err)).toBe('Not found');
  });
  it('returns the message from a plain Error', () => {
    expect(getErrorMessage(new Error('oops'))).toBe('oops');
  });
  it('returns the fallback for non-Error values', () => {
    expect(getErrorMessage('a string')).toBe('Something went wrong. Please try again.');
    expect(getErrorMessage(null)).toBe('Something went wrong. Please try again.');
    expect(getErrorMessage(42)).toBe('Something went wrong. Please try again.');
  });
  it('accepts a custom fallback', () => {
    expect(getErrorMessage(undefined, 'custom fallback')).toBe('custom fallback');
  });
});

describe('isNetworkError', () => {
  it('returns true for network-code ApiError', () => {
    const err = new ApiError({ message: 'Network error', status: 0, code: 'network' });
    expect(isNetworkError(err)).toBe(true);
  });
  it('returns true for timeout-code ApiError', () => {
    const err = new ApiError({ message: 'Timeout', status: 0, code: 'timeout' });
    expect(isNetworkError(err)).toBe(true);
  });
  it('returns false for a server error ApiError', () => {
    const err = new ApiError({ message: 'Bad request', status: 400, code: 'bad_request' });
    expect(isNetworkError(err)).toBe(false);
  });
  it('returns false for a plain Error', () => {
    expect(isNetworkError(new Error('oops'))).toBe(false);
  });
});
