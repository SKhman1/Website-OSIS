import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../integrations/google-forms/Code.gs', import.meta.url), 'utf8');
const secret = 'test-only-secret-0123456789-abcdef';
const requestId = '1cf8d18a-b30a-4b31-bf20-0af16c34abdf';
const payload = { categories: ['kegiatan', 'lainnya'], otherCategory: 'Lingkungan', subject: '', message: 'Tempat sampah 🌱' };
function envelope(data = payload, id = requestId) {
  const timestamp = Date.now();
  const serialized = JSON.stringify(data);
  return { timestamp, requestId: id, payload: serialized,
    signature: createHmac('sha256', secret).update(`${timestamp}\n${id}\n${serialized}`).digest('hex') };
}

function bridge(options: { enabled?: boolean; closed?: boolean; failAfterSubmit?: boolean } = {}) {
  const stored: Record<string, string> = {
    SHARED_SECRET: secret, INTEGRATION_ENABLED: options.enabled === false ? 'false' : 'true', FORM_ID: 'form',
    CATEGORY_ITEM_ID: '1', SUBJECT_ITEM_ID: '2', MESSAGE_ITEM_ID: '3',
  };
  const submissions: unknown[][] = [];
  let accesses = 0;
  const properties = { getProperty: (key: string) => stored[key] ?? null,
    setProperty: (key: string, value: string) => { stored[key] = value; },
    getProperties: () => ({ ...stored }), deleteProperty: (key: string) => { delete stored[key]; } };
  const item = { createResponse: (value: unknown) => value };
  const form = { isAcceptingResponses: () => !options.closed,
    getItemById: () => ({ asCheckboxItem: () => item, asTextItem: () => item, asParagraphTextItem: () => item }),
    createResponse: () => {
      const answers: unknown[] = [];
      const response = { withItemResponse(value: unknown) { answers.push(value); return response; },
        submit() { submissions.push(answers); if (options.failAfterSubmit) throw new Error('ambiguous failure'); return response; } };
      return response;
    },
  };
  const context: Record<string, any> = {
    PropertiesService: { getScriptProperties: () => properties },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    FormApp: { openById: () => { accesses++; return form; } },
    Utilities: { Charset: { UTF_8: 'UTF-8' }, DigestAlgorithm: { SHA_256: 'sha256' },
      computeHmacSha256Signature: (text: string, key: string) => [...createHmac('sha256', key).update(text).digest()],
      computeDigest: (_algorithm: string, text: string) => [...createHash('sha256').update(text).digest()],
      formatDate: () => '2026-10-03',
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ setMimeType: () => text }) },
  };
  runInNewContext(source, context);
  return { submit: (body: unknown) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } })),
    get: () => JSON.parse(context.doGet()), submissions, accesses: () => accesses, stored };
}

test('Apps Script rejects unsigned, tampered and expired requests before opening the form', () => {
  const target = bridge();
  const unsigned = { ...envelope(), signature: '0'.repeat(64) };
  const tampered = { ...envelope(), payload: JSON.stringify({ ...payload, message: 'tampered' }) };
  const stale = { ...envelope(), timestamp: Date.now() - 600_000 };
  for (const body of [unsigned, tampered, stale]) assert.equal(target.submit(body).ok, false);
  assert.equal(target.accesses(), 0);
  assert.equal(target.submissions.length, 0);
  assert.equal(target.get().code, 'METHOD_NOT_ALLOWED');
});

test('Google bridge maps multiple categories and Other, omits optional title, and deduplicates retries', () => {
  const target = bridge();
  const body = envelope();
  assert.deepEqual(target.submit(body), { ok: true, requestId });
  assert.deepEqual(target.submit(envelope()), { ok: true, requestId });
  assert.equal(target.submissions.length, 1);
  assert.equal(JSON.stringify(target.submissions[0]), JSON.stringify([['Kegiatan sekolah', 'Lingkungan'], 'Tempat sampah 🌱']));
  assert.equal(target.submit(envelope({ ...payload, message: 'changed' })).ok, false);
  assert.equal(target.submissions.length, 1);
});

test('disabled bridge, invalid categories and closed Google Form cannot accept submissions', () => {
  const disabled = bridge({ enabled: false });
  assert.equal(disabled.submit(envelope()).code, 'FORM_CLOSED');
  assert.equal(disabled.accesses(), 0);
  const invalid = bridge();
  assert.equal(invalid.submit(envelope({ ...payload, categories: ['__proto__'] })).code, 'INVALID_FIELDS');
  assert.equal(invalid.accesses(), 0);
  const closed = bridge({ closed: true });
  assert.equal(closed.submit(envelope()).code, 'FORM_CLOSED');
  assert.equal(closed.submissions.length, 0);
});

test('ambiguous write remains pending and cannot be blindly written again', () => {
  const target = bridge({ failAfterSubmit: true });
  assert.equal(target.submit(envelope()).code, 'UNAVAILABLE');
  assert.equal(target.submit(envelope()).code, 'PENDING');
  assert.equal(target.submissions.length, 1);
});

test('daily script budget blocks new writes while completed retries still return their receipt', () => {
  const target = bridge();
  assert.equal(target.submit(envelope()).ok, true);
  target.stored.daily = JSON.stringify({ day: '2026-10-03', count: 100 });
  assert.equal(target.submit(envelope()).ok, true);
  assert.equal(target.submit(envelope(payload, '2cf8d18a-b30a-4b31-bf20-0af16c34abdf')).code, 'BUSY');
  assert.equal(target.submissions.length, 1);
});
