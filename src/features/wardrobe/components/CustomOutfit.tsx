'use client';

/**
 * F19b · The outfit the USER puts together.
 *
 * 🔑 WHY THIS IS NOT A LESSER VERSION OF THE SUGGESTIONS.
 *
 *    Many people with colour vision deficiency already own outfits that work,
 *    because someone they trust assembled them — a parent, a partner — and they
 *    wear them because they are known-safe rather than because they chose them.
 *
 *    A product that only proposes its own combinations ignores that, and offers
 *    no way to check the outfit they already rely on. This screen answers the
 *    question nobody has ever been able to ask them: is the safe outfit
 *    actually safe?
 *
 * ⚠️ SO THIS ONE NEVER REFUSES. The suggestions list throws away anything
 *    containing a collision, because it is recommending. Here the person has
 *    already decided, and hiding our verdict because we disagree would leave
 *    them wearing it anyway, without the one thing we exist to tell them.
 */
import { useMemo, useState } from 'react';
import { Check, Plus, Save, Trash2, X } from 'lucide-react';
import type { ColorFamily, ColorPortrait, CVDProfile, Garment } from '@/core/contracts/types';
import { judgeOutfit } from '@/core/color';
import { VerdictBadge, GarmentThumb } from '@/core/ui';
import { saveOutfit } from '../lib/savedOutfits';

/** Grouped so the picker reads like a wardrobe rather than a flat list. */
const GROUPS: { label: string; categories: Garment['category'][] }[] = [
  { label: 'Tops', categories: ['top'] },
  { label: 'Bottoms', categories: ['bottom'] },
  { label: 'Dresses', categories: ['dress'] },
  { label: 'Layers', categories: ['outerwear'] },
  { label: 'Shoes', categories: ['shoes'] },
  { label: 'Accessories', categories: ['scarf', 'hat', 'bag', 'belt', 'tie', 'socks', 'other'] },
];

interface Props {
  garments: Garment[];
  profile: CVDProfile;
  portrait: ColorPortrait | null;
  families: ColorFamily[];
  onSaved: () => void;
  onCancel: () => void;
}

export function CustomOutfit({
  garments,
  profile,
  portrait,
  families,
  onSaved,
  onCancel,
}: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const chosen = useMemo(
    () => picked.map((id) => garments.find((g) => g.id === id)).filter((g): g is Garment => !!g),
    [picked, garments],
  );

  // Judged live as they pick, so the answer arrives while they are still
  // deciding rather than after they commit.
  const verdict = useMemo(
    () =>
      chosen.length >= 2 ? judgeOutfit({ pieces: chosen, profile, portrait, families }) : null,
    [chosen, profile, portrait, families],
  );

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function save() {
    setSaving(true);
    try {
      await saveOutfit(picked, name);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="custom" className="rounded-xl border-2 border-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="custom" className="text-lg font-bold text-slate-900">
            Build your own
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Tap the pieces you want together. We will tell you what we see, whatever you pick.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="shrink-0 rounded-lg border-2 border-slate-300 p-2 text-slate-700"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {GROUPS.map((group) => {
        const items = garments.filter((g) => group.categories.includes(g.category));
        if (items.length === 0) return null;
        return (
          <fieldset key={group.label} className="mt-5">
            <legend className="text-sm font-semibold text-slate-700">{group.label}</legend>
            <ul className="mt-2 flex flex-wrap gap-2" role="list">
              {items.map((g) => {
                const on = picked.includes(g.id);
                return (
                  <li key={g.id}>
                    {/*
                      🔤 Selection is a TICK plus a solid border, never a colour
                      change. The whole product is for people who do not receive
                      colour-coded state, and a picker that signalled "chosen"
                      in colour would be unusable by its own audience.
                    */}
                    <button
                      type="button"
                      onClick={() => toggle(g.id)}
                      aria-pressed={on}
                      className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left ${
                        on ? 'border-slate-900 bg-slate-50' : 'border-slate-300'
                      }`}
                    >
                      <span className="relative">
                        {/*
                          ⚠️ NOT EXPANDABLE HERE, AND NOT ONLY FOR THE MARKUP.
                          `GarmentThumb` normally carries its own tap-to-enlarge
                          button; nested inside this one that is invalid HTML and
                          a hydration error. It is also ambiguous: the same pixels
                          would mean both "enlarge" and "choose", and the person
                          deciding cannot see which they hit. In a picker the
                          photo is a label.
                        */}
                        <GarmentThumb garment={g} profile={profile} size="sm" expandable={false} />
                        {on && (
                          <span className="absolute -right-1 -top-1 rounded-full bg-slate-900 p-0.5">
                            <Check size={11} className="text-white" aria-hidden />
                          </span>
                        )}
                      </span>
                      <span className="text-sm">
                        <span className="block font-semibold text-slate-900">{g.colorName}</span>
                        <span className="block text-slate-600">{g.category}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}

      {chosen.length > 0 && (
        <div className="mt-6 rounded-lg border-2 border-slate-300 p-4">
          <p className="text-sm font-semibold text-slate-700">
            {chosen.length} {chosen.length === 1 ? 'piece' : 'pieces'} chosen
          </p>

          {verdict ? (
            <>
              <div className="mt-2">
                <VerdictBadge verdict={verdict.verdict} />
              </div>
              <p className="mt-2 text-sm text-slate-700">{verdict.certificate}</p>

              {verdict.clashing.length > 0 && (
                <ul className="mt-2 space-y-1" role="list">
                  {verdict.clashing.map((c, i) => (
                    <li key={i} className="text-sm text-slate-700">
                      · {c.verdict.explanation}
                    </li>
                  ))}
                </ul>
              )}
              {verdict.risky.map((r, i) => (
                <p key={i} className="mt-1 text-sm text-slate-600">
                  · {r.verdict.explanation}
                </p>
              ))}
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              Pick one more and we can tell you whether they work together.
            </p>
          )}

          <label htmlFor="outfit-name" className="mt-4 block text-sm font-semibold text-slate-700">
            Call it something you will recognise
          </label>
          <input
            id="outfit-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Monday for work"
            className="mt-1 w-full rounded-lg border-2 border-slate-300 px-3 py-2.5 text-slate-900"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || chosen.length < 2}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              <Save size={16} aria-hidden />
              {saving ? 'Saving…' : 'Save this outfit'}
            </button>
            <button
              type="button"
              onClick={() => setPicked([])}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-slate-300 px-4 py-3 font-semibold text-slate-700"
            >
              <Trash2 size={16} aria-hidden />
              Clear
            </button>
          </div>
        </div>
      )}

      {chosen.length === 0 && (
        <p className="mt-5 flex items-center gap-2 text-sm text-slate-600">
          <Plus size={15} aria-hidden />
          Nothing chosen yet.
        </p>
      )}
    </section>
  );
}
