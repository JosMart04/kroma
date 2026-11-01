'use client';
/**
 * The last resort: an error thrown by the root layout itself, where `error.tsx`
 * cannot help because the layout that would wrap it is the thing that failed.
 *
 * ⚠️ It has to render its own <html> and <body>. Nothing else is mounted at
 *    this point — not the stylesheet either, which is why everything here is
 *    inline. A page that fails to render its own failure is the one case with
 *    no recovery at all.
 */
import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('[kroma] root error', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '1.5rem',
          background: '#fff',
          color: '#0f172a',
          font: '16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <main style={{ maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.75rem' }}>
            KROMA could not start
          </h1>
          <p style={{ margin: '0 0 1rem', color: '#334155' }}>
            Something went wrong before the app finished loading. Nothing you have measured
            is lost — it is stored on this device.
          </p>
          <button
            onClick={reset}
            style={{
              minHeight: '2.75rem',
              padding: '0 1.25rem',
              borderRadius: '0.75rem',
              border: 0,
              background: '#0f172a',
              color: '#fff',
              fontWeight: 600,
              fontSize: '1rem',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
