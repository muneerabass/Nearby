import { ApiError, request } from '../services/apiClient';
import { storage, StorageKeys } from '../services/storage';

function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('authentication transport flow', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await storage.remove(StorageKeys.authToken, StorageKeys.authRefreshToken, StorageKeys.authUser);
    await storage.set(StorageKeys.authToken, 'expired-access-token');
    await storage.set(StorageKeys.authRefreshToken, 'refresh-token-123456789012345678901234567890');
  });

  it('shares one refresh request across parallel expired-session requests', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return response(200, { access_token: 'new-access', refresh_token: 'new-refresh' });
      }
      if (url.endsWith('/protected-a') || url.endsWith('/protected-b')) {
        const authorization = init?.headers as Record<string, string> | undefined;
        return authorization?.Authorization === 'Bearer new-access'
          ? response(200, { ok: true })
          : response(401, { error: 'expired', code: 'unauthorized' });
      }
      return response(404, {});
    });

    const results = await Promise.all([
      request('/protected-a', { auth: true }),
      request('/protected-b', { auth: true }),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/auth/refresh'))).toHaveLength(1);
    expect(await storage.get(StorageKeys.authToken)).toBe('new-access');
  });

  it('does not erase a session on a network failure', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));

    await expect(request('/protected', { auth: true })).rejects.toMatchObject({
      status: 0,
      code: 'network',
    });
    expect(await storage.get(StorageKeys.authRefreshToken)).toBe('refresh-token-123456789012345678901234567890');
  });

  it('clears persisted tokens when refresh is definitively rejected', async () => {
    const unauthorized = jest.fn();
    const { onUnauthorized } = require('../services/apiClient') as typeof import('../services/apiClient');
    const unsubscribe = onUnauthorized(unauthorized);
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/auth/refresh')) return response(401, { error: 'session expired' });
      return response(401, { error: 'expired', code: 'unauthorized' });
    });

    await expect(request('/protected', { auth: true })).rejects.toBeInstanceOf(ApiError);
    expect(await storage.get(StorageKeys.authToken)).toBeNull();
    expect(await storage.get(StorageKeys.authRefreshToken)).toBeNull();
    expect(unauthorized).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
