'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import {
  SESSION_ACTIVITY_COOKIE_NAME,
  SESSION_INACTIVITY_TIMEOUT_MS,
  currentActivityValue,
} from '@/lib/auth/inactivity';

const ACTIVITY_WRITE_THROTTLE_MS = 2000;

export default function WebSessionInactivityGuard() {
  const router = useRouter();
  const lastWriteRef = useRef(0);
  const logoutTimerRef = useRef<number | null>(null);

  const writeActivityCookie = useCallback(() => {
    const now = Date.now();
    if (now - lastWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) {
      return;
    }

    lastWriteRef.current = now;
    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${SESSION_ACTIVITY_COOKIE_NAME}=${currentActivityValue(
      now
    )}; path=/; samesite=lax${secure}`;
  }, []);

  const forceLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        keepalive: true,
      });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }, [router]);

  const resetTimer = useCallback(() => {
    if (logoutTimerRef.current !== null) {
      window.clearTimeout(logoutTimerRef.current);
    }

    logoutTimerRef.current = window.setTimeout(() => {
      void forceLogout();
    }, SESSION_INACTIVITY_TIMEOUT_MS);
  }, [forceLogout]);

  const handleActivity = useCallback(() => {
    writeActivityCookie();
    resetTimer();
  }, [resetTimer, writeActivityCookie]);

  useEffect(() => {
    handleActivity();

    const events: Array<keyof WindowEventMap> = [
      'click',
      'keydown',
      'mousemove',
      'scroll',
      'touchstart',
      'pointerdown',
    ];

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleActivity();
      }
    };

    for (const eventName of events) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      if (logoutTimerRef.current !== null) {
        window.clearTimeout(logoutTimerRef.current);
      }
    };
  }, [handleActivity]);

  return null;
}
