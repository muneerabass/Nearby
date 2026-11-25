import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { Alert } from 'react-native';
import { User } from '../types';
import * as auth from '../services/authService';
import * as addressService from '../services/addressService';
import { storage, StorageKeys } from '../services/storage';
import { onUnauthorized } from '../services/apiClient';

interface AuthState {
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  user: User | null;
  requiresOnboarding: boolean;
}

type AuthAction =
  | { type: 'bootstrapped'; payload: { user: User | null; requiresOnboarding: boolean } }
  | { type: 'submitting'; payload: boolean }
  | { type: 'authenticated'; payload: User }
  | { type: 'signedOut' }
  | { type: 'userUpdated'; payload: User }
  | { type: 'onboardingChecked'; payload: boolean };

const initialState: AuthState = {
  isBootstrapping: true,
  isAuthenticated: false,
  isSubmitting: false,
  user: null,
  requiresOnboarding: false,
};

function reducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'bootstrapped':
      return {
        ...state,
        isBootstrapping: false,
        isAuthenticated: !!action.payload.user,
        user: action.payload.user,
        requiresOnboarding: action.payload.requiresOnboarding,
      };
    case 'submitting':
      return { ...state, isSubmitting: action.payload };
    case 'authenticated':
      return {
        ...state,
        isSubmitting: false,
        isAuthenticated: true,
        user: action.payload,
        requiresOnboarding: action.payload.role === 'customer',
      };
    case 'signedOut':
      return { ...state, isAuthenticated: false, user: null, isSubmitting: false, requiresOnboarding: false };
    case 'userUpdated':
      return { ...state, user: action.payload };
    case 'onboardingChecked':
      return { ...state, requiresOnboarding: action.payload };
    default:
      return state;
  }
}

interface AuthContextValue extends AuthState {
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, otp: string, referralCode?: string) => Promise<User>;
  updateProfile: (name: string | null) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function clearSession() {
  await storage.remove(
    StorageKeys.authUser,
    StorageKeys.authToken,
    StorageKeys.authRefreshToken,
    StorageKeys.activeStoreId,
    StorageKeys.adminActiveStoreId,
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Restore persisted session once at launch. The splash screen is held until this resolves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [user, token] = await Promise.all([
        storage.get<User>(StorageKeys.authUser),
        storage.get<string>(StorageKeys.authToken),
      ]);
      if (cancelled) return;
      dispatch({
        type: 'bootstrapped',
        payload: { user: user && token ? user : null, requiresOnboarding: false },
      });
      if (user && token) {
        // Confirm the saved session is still valid and pick up role changes. A dead
        // session surfaces through the API client's sign-out path; an offline start
        // simply keeps the saved user.
        try {
          const fresh = await auth.getMe();
          if (!cancelled) {
            await storage.set(StorageKeys.authUser, fresh);
            dispatch({ type: 'userUpdated', payload: fresh });
            if (fresh.role === 'customer' && fresh.name) {
              try {
                const addresses = await addressService.listAddresses();
                if (!cancelled) {
                  dispatch({ type: 'onboardingChecked', payload: addresses.length === 0 });
                }
              } catch {
                // Keep offline boot usable; the saved session remains valid.
              }
            }
          }
        } catch {
          // ignore
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Globally force sign-out if a refresh fails inside the API client.
  useEffect(
    () =>
      onUnauthorized(() => {
        void clearSession();
        dispatch({ type: 'signedOut' });
        Alert.alert('Session expired', 'Please sign in again to continue.');
      }),
    [],
  );

  const sendOtp = useCallback(async (phone: string) => {
    dispatch({ type: 'submitting', payload: true });
    try {
      await auth.sendOtp(phone);
    } finally {
      dispatch({ type: 'submitting', payload: false });
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, otp: string, referralCode?: string) => {
    dispatch({ type: 'submitting', payload: true });
    try {
      const response = await auth.verifyOtp(phone, otp, referralCode);
      await Promise.all([
        storage.set(StorageKeys.authToken, response.access_token),
        storage.set(StorageKeys.authRefreshToken, response.refresh_token),
        storage.set(StorageKeys.authUser, response.user),
      ]);
      dispatch({ type: 'authenticated', payload: response.user });
      return response.user;
    } catch (error) {
      dispatch({ type: 'submitting', payload: false });
      throw error;
    }
  }, []);

  const updateProfile = useCallback(async (name: string | null) => {
    const wasMissingName = !state.user?.name;
    const user = await auth.updateProfile(name);
    await storage.set(StorageKeys.authUser, user);
    dispatch({ type: 'userUpdated', payload: user });
    if (wasMissingName && user.role === 'customer') {
      dispatch({ type: 'onboardingChecked', payload: true });
    }
  }, [state.user?.name]);

  const refreshMe = useCallback(async () => {
    try {
      const user = await auth.getMe();
      await storage.set(StorageKeys.authUser, user);
      dispatch({ type: 'userUpdated', payload: user });
    } catch {
      // if /me fails, let the interceptor handle session death
    }
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = await storage.get<string>(StorageKeys.authRefreshToken);
    if (refreshToken) {
      try {
        await auth.logout(refreshToken);
      } catch {
        // best-effort; local wipe still happens below
      }
    }
    await clearSession();
    dispatch({ type: 'signedOut' });
  }, []);

  const completeOnboarding = useCallback(() => {
    dispatch({ type: 'onboardingChecked', payload: false });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, sendOtp, verifyOtp, updateProfile, logout, refreshMe, completeOnboarding }),
    [state, sendOtp, verifyOtp, updateProfile, logout, refreshMe, completeOnboarding],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
