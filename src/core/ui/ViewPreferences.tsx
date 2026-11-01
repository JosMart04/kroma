'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  HOW THIS PERSON WANTS TO SEE COLOUR — remembered
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Assisted contrast is a personal setting, like volume. The evidence is that
 *  people abandon a filter that makes images look wrong however well it
 *  separates colours, so the strength is theirs to choose and it has to
 *  survive a reload.
 *
 *  ⚠️ STORED IN `meta`, NOT IN THE PROFILE. `CVDProfile` is a contract type
 *     consumed by the verdict engine, the families, the harness and half the
 *     screens; adding a display preference to it would put a UI concern inside
 *     the measurement contract. The `meta` key/value store already exists for
 *     exactly this.
 *
 *  ⚠️ NOTHING DERIVED IS EVER STORED. The daltonised and simulated views are
 *     computed at render from the original. Saving them would triple storage
 *     and, worse, they would go stale the moment someone recalibrates — a
 *     stale derivative throws no error, it just quietly shows a filter built
 *     for a profile that is no longer theirs.
 *
 *  Context rather than a state manager, which is what `CLAUDE.md` allows.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMeta, setMeta } from '@/core/db';

export interface ViewPreferences {
  /** Whether the app shows colours through the assisted-contrast filter. */
  assistedContrast: boolean;
  /** 0–1. Gentle by default; people switch off filters that look wrong. */
  strength: number;
}

/**
 * ⚠️ ON BY DEFAULT, WHICH IS A PRODUCT DECISION AND NOT AN OVERSIGHT. This app
 *    is for people who cannot separate certain colours; shipping the help
 *    switched off would mean the only people who ever see it are the ones who
 *    already knew to look for it.
 */
export const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
  assistedContrast: true,
  strength: 0.55,
};

/** Full strength, for when the only thing that matters is reading something. */
export const READ_A_LABEL_STRENGTH = 1;

const KEY = 'view-preferences';

interface Ctx extends ViewPreferences {
  /** True until the stored value has been read, so nothing flashes. */
  loading: boolean;
  update: (patch: Partial<ViewPreferences>) => void;
}

const ViewPreferencesContext = createContext<Ctx>({
  ...DEFAULT_VIEW_PREFERENCES,
  loading: true,
  update: () => undefined,
});

export function ViewPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<ViewPreferences>(DEFAULT_VIEW_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getMeta(KEY)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Partial<ViewPreferences>;
            setPrefs({ ...DEFAULT_VIEW_PREFERENCES, ...parsed });
          } catch {
            // A corrupt preference is not worth an error screen over.
          }
        }
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<ViewPreferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      // Fire and forget: the screen must respond now, and a storage failure
      // costs a preference, not the session.
      setMeta(KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...prefs, loading, update }), [prefs, loading, update]);

  return (
    <ViewPreferencesContext.Provider value={value}>{children}</ViewPreferencesContext.Provider>
  );
}

export function useViewPreferences(): Ctx {
  return useContext(ViewPreferencesContext);
}
