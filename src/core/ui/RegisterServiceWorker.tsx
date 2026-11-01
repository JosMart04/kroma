'use client';
/**
 * Registers the service worker, which is what makes Chrome offer "Install".
 *
 * ⚠️ Registration failing must never be visible. Installability is a nicety;
 *    the app works identically without it, and an error toast about a worker
 *    would be noise in front of someone trying to photograph a shirt.
 */
import { useEffect } from 'react';

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // After hydration and out of the way of the first paint: registering during
    // load competes with the very resources it is supposed to help deliver.
    const id = window.setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(id);
  }, []);

  return null;
}
