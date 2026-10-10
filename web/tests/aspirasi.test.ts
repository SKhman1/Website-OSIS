import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import type { APIContext } from 'astro';
import { ALL, POST } from '../src/server/routes/aspirasi';
import { onRequest } from '../functions/api/aspirasi';
import { handleAspirationRequest, type AspirationEnvironment } from '../src/server/aspirations';

const env: AspirationEnvironment = {
  ASPIRATIONS_ENABLED: 'true', GOOGLE_FORMS_SCRIPT_URL: 'https://script.google.com/macros/s/Example_deployment/exec',
  GOOGLE_FORMS_SHARED_SECRET: 'test-only-secret-0123456789-abcdef', TURNSTILE_SECRET_KEY: 'test-only-turnstile',
};
const requestId = '1cf8d18a-b30a-4b31-bf20-0af16c34abdf';
const validBody = { categories: ['kegiatan', 'lainnya'], otherCategory: 'Lingkungan', subject: '',
  message: 'Tambahkan tempat sampah 🌱', requestId, turnstileToken: 'test-token', website: '' };
function request(body: unknown = validBody, headers: Record<string, string> = {}) {
  return new Request('https://vnd-smkdipo1.pages.dev/api/aspirasi', {
    method: 'POST', headers: { Origin: 'https://vnd-smkdipo1.pages.dev', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
const neverFetch: typeof fetch = async () => { throw new Error('Unexpected network access'); };

test('Node and Pages fail closed without consuming submission bodies', async () => {
  const nodeRequest = request();
  const pagesRequest = request();
  for (const response of [await POST({ request: nodeRequest } as APIContext), await onRequest({ request: pagesRequest })]) {
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal((await response.json()).code, 'ASPIRATIONS_NOT_OPEN');
  }
  assert.equal(nodeRequest.bodyUsed, false);
  assert.equal(pagesRequest.bodyUsed, false);
});

test('public API cannot read responses, even with a complete configuration', async () => {
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const pages = await onRequest({ request: new Request('https://vnd-smkdipo1.pages.dev/api/aspirasi', { method }), env });
    assert.equal(pages.status, 405);
    assert.equal(pages.headers.get('Allow'), 'POST');
    assert.equal(await pages.text(), '');
  }
  assert.equal((await ALL({ request: new Request('http://localhost/api/aspirasi') } as APIContext)).status, 405);
});

test('missing configuration or a non-Google URL fails closed', async () => {
  for (const changes of [{ ASPIRATIONS_ENABLED: 'false' }, { TURNSTILE_SECRET_KEY: '' },
    { GOOGLE_FORMS_SHARED_SECRET: 'short' }, { GOOGLE_FORMS_SCRIPT_URL: 'https://example.com/exec' }]) {
    const input = request();
    assert.equal((await handleAspirationRequest(input, { ...env, ...changes }, { fetch: neverFetch })).status, 503);
    assert.equal(input.bodyUsed, false);
  }
});

test('cross-origin submissions and unsupported content types never contact Google', async () => {
  for (const [headers, status] of [
    [{ Origin: 'https://attacker.example' }, 403],
    [{ 'Sec-Fetch-Site': 'cross-site' }, 403],
    [{ 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
  ] as const) {
    assert.equal((await handleAspirationRequest(request(validBody, headers), env, { fetch: neverFetch })).status, status);
  }
});

test('malformed, oversized and chunked request bodies are rejected before external calls', async () => {
  assert.equal((await handleAspirationRequest(request({ ...validBody, message: 'a'.repeat(17_000) }), env, { fetch: neverFetch })).status, 413);
  const malformed = new Request('https://vnd-smkdipo1.pages.dev/api/aspirasi', {
    method: 'POST', headers: { Origin: 'https://vnd-smkdipo1.pages.dev', 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal((await handleAspirationRequest(malformed, env, { fetch: neverFetch })).status, 400);
  const streamed = new Request('https://vnd-smkdipo1.pages.dev/api/aspirasi', {
    method: 'POST', headers: { Origin: 'https://vnd-smkdipo1.pages.dev', 'Content-Type': 'application/json' },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(17_000)); controller.close(); } }),
    duplex: 'half',
  } as RequestInit);
  assert.equal((await handleAspirationRequest(streamed, env, { fetch: neverFetch })).status, 413);
});

test('invalid fields, honeypot and missing verification cannot be forwarded', async () => {
  for (const changes of [{ categories: [] }, { categories: ['unknown'] }, { categories: ['osis', 'osis'] },
    { otherCategory: '' }, { subject: 'a'.repeat(121) }, { message: '   ' }, { message: 'a'.repeat(3001) },
    { website: 'spam' }, { turnstileToken: '' }, { requestId: 'not-a-uuid' }]) {
    assert.equal((await handleAspirationRequest(request({ ...validBody, ...changes }), env, { fetch: neverFetch })).status, 400);
  }
});

test('verified Unicode submission has a valid HMAC and public response exposes no student data', async () => {
  let count = 0;
  const fetcher: typeof fetch = async (input, options) => {
    count++;
    if (String(input).includes('/siteverify')) {
      return Response.json({ success: true, hostname: 'vnd-smkdipo1.pages.dev', action: 'aspirasi' });
    }
    assert.equal(String(input), env.GOOGLE_FORMS_SCRIPT_URL);
    const envelope = JSON.parse(String(options?.body));
    assert.equal(envelope.requestId, requestId);
    assert.equal(envelope.signature, createHmac('sha256', env.GOOGLE_FORMS_SHARED_SECRET!).update(
      `${envelope.timestamp}\n${requestId}\n${envelope.payload}`).digest('hex'));
    assert.deepEqual(JSON.parse(envelope.payload), {
      categories: ['kegiatan', 'lainnya'], otherCategory: 'Lingkungan', subject: '', message: 'Tambahkan tempat sampah 🌱',
    });
    assert.equal(envelope.turnstileToken, undefined);
    return Response.json({ ok: true, requestId, privateResponseId: 'must-not-be-returned' });
  };
  const response = await handleAspirationRequest(request(), env, { fetch: fetcher });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.code, 'ASPIRATION_RECEIVED');
  assert.deepEqual(Object.keys(result).sort(), ['code', 'message']);
  assert.equal(count, 2);
});

test('failed, replayed or mismatched Turnstile tokens do not reach the bridge', async () => {
  for (const verified of [{ success: false }, { success: true, hostname: 'other.example', action: 'aspirasi' },
    { success: true, hostname: 'vnd-smkdipo1.pages.dev', action: 'other' }]) {
    let count = 0;
    const fetcher: typeof fetch = async () => { count++; return Response.json(verified); };
    assert.equal((await handleAspirationRequest(request(), env, { fetch: fetcher })).status, 400);
    assert.equal(count, 1);
  }
});

test('Google errors, closed form, mismatched receipts and network failures never claim success', async () => {
  for (const receipt of [{ ok: false, code: 'FORM_CLOSED' }, { ok: false, code: 'PENDING' },
    { ok: false, code: 'BUSY' }, { ok: true, requestId: 'wrong' }, { rawError: 'private Google error' }]) {
    const fetcher: typeof fetch = async input => String(input).includes('/siteverify')
      ? Response.json({ success: true, hostname: 'vnd-smkdipo1.pages.dev', action: 'aspirasi' }) : Response.json(receipt);
    const response = await handleAspirationRequest(request(), env, { fetch: fetcher });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private Google error|ASPIRATION_RECEIVED/);
  }
  const response = await handleAspirationRequest(request(), env, { fetch: async () => { throw new Error('secret network detail'); } });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret network detail/);
});
