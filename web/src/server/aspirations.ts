import { validateAspiration } from '../lib/aspiration-form';

export interface AspirationEnvironment {
  ASPIRATIONS_ENABLED?: string;
  GOOGLE_FORMS_SCRIPT_URL?: string;
  GOOGLE_FORMS_SHARED_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
}
interface Dependencies { fetch?: typeof fetch; now?: () => number; }
const maxBodyBytes = 16_384;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(status: number, code: string, message: string, extra = {}): Response {
  return Response.json({ code, message, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function closedAspirationsResponse(method: string): Response {
  if (method !== 'POST') return new Response(null, {
    status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
  });
  return reply(503, 'ASPIRATIONS_NOT_OPEN', 'Ruang aspirasi belum dibuka. Silakan kembali lagi nanti.');
}

async function readLimitedJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('Content-Length')) > maxBodyBytes) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let body = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) { await reader.cancel(); throw new RangeError(); }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } finally { reader.releaseLock(); }
}

export async function signEnvelope(timestamp: number, requestId: string, payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}\n${requestId}\n${payload}`));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Public API accepts submissions only; no Google response/list endpoint exists.
export async function handleAspirationRequest(request: Request, env: AspirationEnvironment = {}, dependencies: Dependencies = {}): Promise<Response> {
  if (request.method !== 'POST') return closedAspirationsResponse(request.method);
  const scriptUrl = env.GOOGLE_FORMS_SCRIPT_URL ?? '';
  const configuration = {
    enabled: env.ASPIRATIONS_ENABLED === 'true',
    turnstile: Boolean(env.TURNSTILE_SECRET_KEY),
    sharedSecret: (env.GOOGLE_FORMS_SHARED_SECRET?.length ?? 0) >= 32,
    scriptUrl: /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(scriptUrl),
  };
  if (Object.values(configuration).some(ready => !ready)) {
    // Private operator logs contain readiness flags only, never credential values.
    console.warn('ASPIRATION_CONFIGURATION_INCOMPLETE', configuration);
    return closedAspirationsResponse('POST');
  }
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return reply(403, 'ORIGIN_REJECTED', 'Kirim aspirasi melalui formulir di website OSIS.');
  }
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    return reply(415, 'JSON_REQUIRED', 'Gunakan formulir di website untuk mengirim aspirasi.');
  }
  let raw: Record<string, unknown>;
  try {
    const value = await readLimitedJson(request);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyntaxError();
    raw = value as Record<string, unknown>;
  } catch (error) {
    return error instanceof RangeError
      ? reply(413, 'BODY_TOO_LARGE', 'Kiriman terlalu panjang. Ringkas aspirasimu, lalu coba lagi.')
      : reply(400, 'INVALID_BODY', 'Kiriman tidak valid. Muat ulang formulir dan coba lagi.');
  }
  const validation = validateAspiration(raw);
  if (!validation.data) return reply(400, 'INVALID_FIELDS', 'Periksa kembali kolom yang ditandai.', { errors: validation.errors });
  if (raw.website || typeof raw.requestId !== 'string' || !uuidPattern.test(raw.requestId)) {
    return reply(400, 'INVALID_REQUEST', 'Muat ulang formulir dan coba lagi.');
  }
  if (typeof raw.turnstileToken !== 'string' || !raw.turnstileToken || raw.turnstileToken.length > 2048) {
    return reply(400, 'VERIFICATION_REQUIRED', 'Selesaikan pemeriksaan keamanan sebelum mengirim.');
  }
  const fetcher = dependencies.fetch ?? fetch;
  try {
    const check = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: raw.turnstileToken }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!check.ok) throw new Error('Verification unavailable');
    const verified = await check.json() as { success?: boolean; hostname?: string; action?: string };
    if (verified.success !== true || verified.hostname !== new URL(origin).hostname || verified.action !== 'aspirasi') {
      return reply(400, 'VERIFICATION_FAILED', 'Pemeriksaan keamanan kedaluwarsa atau gagal. Coba lagi.');
    }
    const timestamp = (dependencies.now ?? Date.now)();
    const payload = JSON.stringify(validation.data);
    const signature = await signEnvelope(timestamp, raw.requestId, payload, env.GOOGLE_FORMS_SHARED_SECRET!);
    const upstream = await fetcher(scriptUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timestamp, requestId: raw.requestId, payload, signature }),
      redirect: 'follow', signal: AbortSignal.timeout(20_000),
    });
    if (!upstream.ok) throw new Error('Bridge unavailable');
    const receipt = await upstream.json() as { ok?: boolean; code?: string; requestId?: string };
    if (receipt.ok === true && receipt.requestId === raw.requestId) {
      return reply(200, 'ASPIRATION_RECEIVED', 'Terima kasih. Aspirasimu sudah diterima pengurus OSIS.');
    }
    if (receipt.code === 'FORM_CLOSED') return closedAspirationsResponse('POST');
    if (receipt.code === 'BUSY') return reply(503, 'TRY_AGAIN', 'Pengiriman sedang sibuk. Tunggu sebentar, lalu coba lagi.');
    if (receipt.code === 'PENDING') {
      return reply(503, 'DELIVERY_UNCONFIRMED', 'Kirimanmu sedang diperiksa. Tunggu sebentar sebelum mencoba lagi.');
    }
    throw new Error('No confirmed receipt');
  } catch {
    // Never log student messages, credentials, or Google response/error bodies.
    return reply(503, 'DELIVERY_UNCONFIRMED', 'Pengiriman belum dapat dikonfirmasi. Isianmu tetap tersimpan di halaman ini; tunggu sebentar, lalu coba lagi.');
  }
}
