// Paste into the Apps Script project bound to the OSIS Google Form.
// Run configureIntegration once in the editor; deploy doPost as a web app.
// No function lists responses or returns student answers over HTTP.
var RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
var CATEGORY_LABELS = { kegiatan: 'Kegiatan sekolah', fasilitas: 'Fasilitas', osis: 'OSIS' };

function configureIntegration() {
  var form = FormApp.getActiveForm();
  if (!form) throw new Error('Open Apps Script from the Google Form before running setup.');
  var definitions = [
    ['CATEGORY_ITEM_ID', 'Kategori aspirasi', FormApp.ItemType.CHECKBOX],
    ['SUBJECT_ITEM_ID', 'Judul aspirasi', FormApp.ItemType.TEXT],
    ['MESSAGE_ITEM_ID', 'Sampaikan aspirasi', FormApp.ItemType.PARAGRAPH_TEXT],
  ];
  var config = { FORM_ID: form.getId(), INTEGRATION_ENABLED: 'false' };
  definitions.forEach(function (definition) {
    var found = form.getItems().filter(function (item) { return item.getTitle() === definition[1]; });
    if (found.length !== 1 || found[0].getType() !== definition[2]) {
      throw new Error('Check the title/type of question: ' + definition[1]);
    }
    config[definition[0]] = String(found[0].getId());
  });
  var category = form.getItemById(Number(config.CATEGORY_ITEM_ID)).asCheckboxItem();
  var choices = category.getChoices().map(function (choice) { return choice.getValue(); });
  if (!Object.keys(CATEGORY_LABELS).every(function (key) { return choices.indexOf(CATEGORY_LABELS[key]) >= 0; }) || !category.hasOtherOption()) {
    throw new Error('Use Kegiatan sekolah, Fasilitas, OSIS and the built-in Other option.');
  }
  var properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('SHARED_SECRET')) {
    config.SHARED_SECRET = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  }
  properties.setProperties(config);
  // Does not change form questions, permissions, or responses. No secrets logged.
  console.log('Setup complete. Configure INTEGRATION_ENABLED and copy SHARED_SECRET from Script Properties into Cloudflare Secrets.');
}

function doGet() { return json_({ ok: false, code: 'METHOD_NOT_ALLOWED' }); }

function doPost(event) {
  try {
    var properties = PropertiesService.getScriptProperties();
    var secret = properties.getProperty('SHARED_SECRET');
    var body = event && event.postData && event.postData.contents;
    if (!secret || secret.length < 32 || !body || body.length > 25000) return json_({ ok: false, code: 'REJECTED' });
    var envelope = JSON.parse(body);
    if (!Number.isSafeInteger(envelope.timestamp) || Math.abs(Date.now() - envelope.timestamp) > 5 * 60 * 1000 ||
        typeof envelope.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(envelope.requestId) ||
        typeof envelope.payload !== 'string' || envelope.payload.length > 16000 ||
        typeof envelope.signature !== 'string' || !/^[0-9a-f]{64}$/.test(envelope.signature)) {
      return json_({ ok: false, code: 'REJECTED' });
    }
    var expected = hex_(Utilities.computeHmacSha256Signature(
      envelope.timestamp + '\n' + envelope.requestId + '\n' + envelope.payload, secret, Utilities.Charset.UTF_8));
    if (!sameSignature_(expected, envelope.signature)) return json_({ ok: false, code: 'REJECTED' });
    if (properties.getProperty('INTEGRATION_ENABLED') !== 'true') return json_({ ok: false, code: 'FORM_CLOSED' });
    var payload = JSON.parse(envelope.payload);
    if (!validPayload_(payload)) return json_({ ok: false, code: 'INVALID_FIELDS' });
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return json_({ ok: false, code: 'BUSY' });
    try {
      var receiptKey = 'receipt.' + envelope.requestId;
      var digest = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, envelope.payload, Utilities.Charset.UTF_8));
      var existing = properties.getProperty(receiptKey);
      if (existing) {
        var receipt = JSON.parse(existing);
        if (receipt.digest !== digest) return json_({ ok: false, code: 'REJECTED' });
        if (Date.now() - receipt.timestamp <= RECEIPT_TTL_MS) {
          return receipt.state === 'sent'
            ? json_({ ok: true, requestId: envelope.requestId })
            : json_({ ok: false, code: 'PENDING' });
        }
      }
      var form = FormApp.openById(properties.getProperty('FORM_ID'));
      if (!form.isAcceptingResponses()) return json_({ ok: false, code: 'FORM_CLOSED' });
      var category = form.getItemById(Number(properties.getProperty('CATEGORY_ITEM_ID'))).asCheckboxItem();
      var subject = form.getItemById(Number(properties.getProperty('SUBJECT_ITEM_ID'))).asTextItem();
      var message = form.getItemById(Number(properties.getProperty('MESSAGE_ITEM_ID'))).asParagraphTextItem();
      var labels = payload.categories.map(function (value) { return value === 'lainnya' ? payload.otherCategory : CATEGORY_LABELS[value]; });
      var response = form.createResponse().withItemResponse(category.createResponse(labels));
      if (payload.subject) response = response.withItemResponse(subject.createResponse(payload.subject));
      response = response.withItemResponse(message.createResponse(payload.message));
      // Bounded daily budget protects this small-volume form's script quota.
      var day = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
      var daily = JSON.parse(properties.getProperty('daily') || '{"day":"","count":0}');
      if (daily.day !== day) daily = { day: day, count: 0 };
      if (daily.count >= 100) return json_({ ok: false, code: 'BUSY' });
      pruneReceipts_(properties);
      var pending = { state: 'pending', digest: digest, timestamp: Date.now() };
      properties.setProperty(receiptKey, JSON.stringify(pending));
      properties.setProperty('daily', JSON.stringify({ day: day, count: daily.count + 1 }));
      // A pending marker survives ambiguous failures. Never blindly submit again.
      response.submit();
      properties.setProperty(receiptKey, JSON.stringify({ state: 'sent', digest: digest, timestamp: pending.timestamp }));
      return json_({ ok: true, requestId: envelope.requestId });
    } finally { lock.releaseLock(); }
  } catch (_error) {
    // Do not log student content, signatures, credentials, or raw Google errors.
    return json_({ ok: false, code: 'UNAVAILABLE' });
  }
}

function validPayload_(payload) {
  if (!payload || !Array.isArray(payload.categories) || !payload.categories.length || payload.categories.length > 4 ||
      payload.categories.some(function (value) { return value !== 'lainnya' && !Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, value); }) ||
      new Set(payload.categories).size !== payload.categories.length) return false;
  if (typeof payload.subject !== 'string' || payload.subject.length > 120 ||
      typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 3000 ||
      typeof payload.otherCategory !== 'string' || payload.otherCategory.length > 120) return false;
  return payload.categories.indexOf('lainnya') < 0 || Boolean(payload.otherCategory.trim());
}

function pruneReceipts_(properties) {
  var all = properties.getProperties();
  Object.keys(all).filter(function (key) { return key.indexOf('receipt.') === 0; }).forEach(function (key) {
    if (Date.now() - JSON.parse(all[key]).timestamp > RECEIPT_TTL_MS) properties.deleteProperty(key);
  });
}
function hex_(bytes) { return bytes.map(function (byte) { return ((byte + 256) % 256).toString(16).padStart(2, '0'); }).join(''); }
function sameSignature_(a, b) {
  if (a.length !== b.length) return false;
  var difference = 0;
  for (var i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
