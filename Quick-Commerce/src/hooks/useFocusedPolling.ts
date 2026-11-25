import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Calls `tick` every `intervalMs`, but only while the screen is focused and the app
 * is in the foreground. Resumes with an immediate tick so stale data refreshes the
 * moment the user is back. Pass `enabled=false` to stop (e.g. a finished order).
 */
type PollResult = void | boolean | Promise<void | boolean>;

/** Focused, non-overlapping polling with a small exponential backoff. Returning
 * false (or rejecting) marks a poll as failed; callers can keep showing stale
 * data while the next attempt is delayed. */
export function useFocusedPolling(tick: () => PollResult, intervalMs: number, enabled = true): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;
      let running = false;
      let failures = 0;
      const stop = () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        timer = null;
      };
      const schedule = (delay: number) => {
        if (stopped || timer) return;
        timer = setTimeout(() => {
          timer = null;
          void run();
        }, delay);
      };
      const run = async () => {
        if (stopped || running || AppState.currentState !== 'active') return;
        running = true;
        try {
          const result = await tickRef.current();
          failures = result === false ? Math.min(failures + 1, 2) : 0;
        } catch {
          failures = Math.min(failures + 1, 2);
        } finally {
          running = false;
          schedule(intervalMs * 2 ** failures);
        }
      };
      if (AppState.currentState === 'active') void run();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          stopped = false;
          failures = 0;
          void run();
        } else {
          stop();
        }
      });
      return () => {
        stop();
        subscription.remove();
      };
    }, [enabled, intervalMs]),
  );

}
