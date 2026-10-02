import assert from 'node:assert/strict';
import test from 'node:test';
import type { APIContext } from 'astro';
import { ALL, POST } from '../src/server/routes/aspirasi';
import { onRequest } from '../functions/api/aspirasi';

test('submitting directly cannot bypass the closed phase-one form', async () => {
  const context = { request: new Request('http://localhost/api/aspirasi', {
    method: 'POST', body: 'message=Sent+from+DevTools',
  }) } as APIContext;
  const response = await POST(context);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).code, 'ASPIRATIONS_NOT_OPEN');
  assert.equal(context.request.bodyUsed, false);
});

test('public requests cannot list aspirations', async () => {
  const response = await ALL({ request: new Request('http://localhost/api/aspirasi') } as APIContext);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
  assert.equal(await response.text(), '');
});

test('Cloudflare rejects a direct submission without consuming its body', async () => {
  const request = new Request('https://osis-dipo1.pages.dev/api/aspirasi', {
    method: 'POST', body: 'message=Bypass',
  });
  const response = onRequest({ request });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'ASPIRATIONS_NOT_OPEN');
  assert.equal(request.bodyUsed, false);
});

test('Cloudflare does not expose aspirations through other methods', () => {
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = onRequest({ request: new Request('https://osis-dipo1.pages.dev/api/aspirasi', { method }) });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('Allow'), 'POST');
  }
});
