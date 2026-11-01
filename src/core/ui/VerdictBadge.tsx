/**
 * Insignia de veredicto. ⛔ PROPIETARIO: P1. Consumen P3 y P4.
 *
 * ⚠️⚠️ REGLA DE ACCESIBILIDAD NO NEGOCIABLE ⚠️⚠️
 * El significado viaja en ICONO + TEXTO + FORMA. El color es solo decoración.
 * Estamos construyendo para usuarios que no perciben bien el color: si el
 * estado depende de verde/ámbar/rojo, nuestro propio usuario no lo recibe.
 * Sería un fallo de producto y un juez con criterio lo va a notar.
 */
import { Check, AlertTriangle, X } from 'lucide-react';
import type { Verdict } from '@/core/contracts/types';
import { cn } from './cn';

const MAP = {
  safe:  { Icon: Check,         label: 'Safe',    ring: 'ring-emerald-600', text: 'text-emerald-900', bg: 'bg-emerald-50' },
  risky: { Icon: AlertTriangle, label: 'Risky', ring: 'ring-amber-600',  text: 'text-amber-900',   bg: 'bg-amber-50' },
  clash: { Icon: X,             label: 'Clashes',     ring: 'ring-rose-700',    text: 'text-rose-900',    bg: 'bg-rose-50' },
} as const;

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const { Icon, label, ring, text, bg } = MAP[verdict];
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
        'ring-2 ring-offset-1', ring, text, bg, className,
      )}
    >
      <Icon size={16} aria-hidden />
      {label}
    </span>
  );
}
