/**
 * Sondeo de tareas asíncronas.
 * ⛔ PROPIETARIO: P1. Todos consumen. Nadie reimplementa.
 */
import { YOUCAM_BASE_URL, POLL_POLICY } from './config';
import { YouCamError, PollTimeout } from './errors';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ⚠️ TRAMPA 2: EL SONDEO ES OBLIGATORIO Y SU ABANDONO SE COBRA.
 *
 * Una tarea caduca si no se sondea dentro de su ventana de retención, INCLUSO
 * si el motor la completó con éxito. Una consulta posterior devuelve
 * `InvalidTaskId` y **las unidades se consumen igual**.
 *
 * Consecuencia práctica: nunca abandones un sondeo en silencio. Si se agota,
 * registra el taskId — la unidad ya está comprometida y el resultado sigue
 * recuperable durante 30 días.
 *
 * En cambio, mientras la tarea está en `running` NO se consume nada, y una
 * tarea en `error` tampoco descuenta. Hay margen real para experimentar.
 */
export async function pollTask<T = unknown>(
  endpointPath: string,
  taskId: string,
  policyKey: keyof typeof POLL_POLICY | string = 'default',
  apiKey = process.env.YOUCAM_API_KEY,
): Promise<T> {
  const p = POLL_POLICY[policyKey] ?? POLL_POLICY.default;
  let wait = p.first;
  const started = Date.now();

  while (Date.now() - started < p.deadlineMs) {
    const res = await fetch(`${YOUCAM_BASE_URL}${endpointPath}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
    const json = await res.json();
    const status = json?.data?.task_status;

    if (status === 'success') return json.data as T;
    if (status === 'error') {
      throw new YouCamError(
        json?.data?.error ?? 'unknown_internal_error',
        endpointPath,
        taskId,
        typeof json?.data?.error_message === 'string'
          ? json.data.error_message
          : JSON.stringify(json?.data)?.slice(0, 300),
      );
    }

    await sleep(wait);
    wait = Math.min(wait * p.factor, p.max);
  }

  // Nunca fallar en silencio: la unidad ya está comprometida.
  throw new PollTimeout(endpointPath, taskId);
}

/**
 * ⚠️ TRAMPA 3: LA URL DEL RESULTADO VIVE DOS HORAS.
 *
 * El file_id y el task_id sobreviven 30 días, pero el ENLACE de descarga no.
 * Guardar la URL es guardar un enlace muerto: si grabas el vídeo con URLs de
 * hace más de dos horas, el demo se cae en cámara. Y si un juez abre la app
 * durante el período de evaluación (18–31 de agosto), cualquier resultado
 * servido desde una URL guardada devolverá error.
 *
 * REGLA: en el momento en que una tarea devuelve `success`, se descarga el
 * binario y se guarda en NUESTRO storage. No después.
 */
export async function downloadResult(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `No se pudo descargar el resultado (${res.status}). ` +
        `Recuerda: la URL caduca a las 2 horas. Descarga en cuanto la tarea sea success.`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}
