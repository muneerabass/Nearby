import { Platform } from 'react-native';

const DEFAULT_API_BASE_URL = Platform.select({
  // Android emulator cannot reach host machine via localhost.
  android: 'http://10.0.2.2:3000',
  // iOS simulator shares the host loopback.
  ios: 'http://localhost:3000',
  default: 'http://localhost:3000',
});

/** Backend origin. Configure this with EXPO_PUBLIC_API_URL (never a secret). */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL!).replace(/\/+$/, '');

/** All application endpoints are versioned beneath the backend origin. */
export const API_PREFIX = `${API_BASE_URL}/api/v1`;
