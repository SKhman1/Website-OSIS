import { validateAspiration, type AspirationField } from '../lib/aspiration-form';
import { notify } from './notifications';

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
}
const form = document.querySelector<HTMLFormElement>('#aspiration-form');
if (form?.dataset.enabled === 'true' && form.dataset.siteKey) initialize(form);

function initialize(form: HTMLFormElement) {
  const fields = form.querySelector<HTMLFieldSetElement>('#aspiration-fields')!;
  const status = document.querySelector<HTMLElement>('#form-status')!;
  const button = form.querySelector<HTMLButtonElement>('#aspiration-submit')!;
  const buttonLabel = form.querySelector<HTMLElement>('#aspiration-submit-label')!;
  const spinner = form.querySelector<HTMLElement>('#aspiration-spinner')!;
  const otherGroup = form.querySelector<HTMLElement>('#other-category-group')!;
  const otherInput = form.querySelector<HTMLInputElement>('#otherCategory')!;
  const otherCheckbox = form.querySelector<HTMLInputElement>('#category-lainnya')!;
  const message = form.querySelector<HTMLTextAreaElement>('#message')!;
  const counter = form.querySelector<HTMLElement>('#message-count')!;
  const verification = form.querySelector<HTMLElement>('#aspiration-verification')!;
  const formatter = new Intl.NumberFormat('id-ID');
  let token = '';
  let widgetId: string | undefined;
  let api: Turnstile | undefined;
  let busy = false;
  let dirty = false;
  let previousPayload = '';
  let requestId = '';
  fields.disabled = false;
  status.textContent = 'Pilih kategori dan sampaikan aspirasimu. Judul boleh dikosongkan.';

  function updateOther() {
    otherGroup.hidden = !otherCheckbox.checked;
    otherInput.disabled = !otherCheckbox.checked;
    otherInput.required = otherCheckbox.checked;
  }
  function errors(messages: Partial<Record<AspirationField, string>>) {
    const names: AspirationField[] = ['categories', 'otherCategory', 'subject', 'message'];
    let first: HTMLElement | undefined;
    names.forEach(name => {
      const error = form.querySelector<HTMLElement>(`#${name}-error`)!;
      error.textContent = messages[name] ?? '';
      error.hidden = !messages[name];
      const controls = Array.from(form.querySelectorAll<HTMLElement>(`[name="${name}"]`));
      controls.forEach(control => {
        if (messages[name]) control.setAttribute('aria-invalid', 'true');
        else control.removeAttribute('aria-invalid');
      });
      if (messages[name] && !first) first = controls[0];
    });
    first?.focus();
  }
  form.addEventListener('input', () => {
    dirty = true;
    updateOther();
    counter.textContent = `${formatter.format(message.value.length)} / ${formatter.format(3000)} karakter`;
  });
  window.addEventListener('beforeunload', event => {
    if (!dirty) return;
    event.preventDefault();
  });
  updateOther();

  const script = document.createElement('script');
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.addEventListener('load', () => {
    api = (window as Window & { turnstile?: Turnstile }).turnstile;
    if (!api) { status.textContent = 'Pemeriksaan keamanan belum siap. Muat ulang halaman untuk mencoba lagi.'; return; }
    widgetId = api.render(verification, {
      sitekey: form.dataset.siteKey, action: 'aspirasi', language: 'id', size: 'compact',
      callback: (value: string) => { token = value; },
      'expired-callback': () => { token = ''; },
      'error-callback': () => { token = ''; status.textContent = 'Pemeriksaan keamanan gagal. Periksa koneksi dan coba lagi.'; },
    });
  });
  script.addEventListener('error', () => { status.textContent = 'Pemeriksaan keamanan gagal dimuat. Periksa koneksi dan muat ulang halaman.'; });
  document.head.append(script);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(form);
    const validation = validateAspiration({
      categories: values.getAll('categories'), otherCategory: values.get('otherCategory') ?? '',
      subject: values.get('subject'), message: values.get('message'),
    });
    errors(validation.errors);
    if (!validation.data) { status.textContent = 'Periksa kembali kolom yang ditandai.'; return; }
    if (!token) { status.textContent = 'Tunggu pemeriksaan keamanan selesai, lalu tekan Kirim aspirasi lagi.'; return; }
    const serialized = JSON.stringify(validation.data);
    if (serialized !== previousPayload || !requestId) {
      previousPayload = serialized;
      requestId = crypto.randomUUID();
    }
    busy = true;
    fields.disabled = true;
    form.setAttribute('aria-busy', 'true');
    spinner.hidden = false;
    buttonLabel.textContent = 'Mengirim…';
    status.textContent = 'Aspirasimu sedang dikirim. Tunggu konfirmasi penerimaan.';
    try {
      const response = await fetch('/api/aspirasi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ ...validation.data, requestId, turnstileToken: token, website: values.get('website') ?? '' }),
        signal: AbortSignal.timeout(35_000),
      });
      const receipt = await response.json() as { code?: string; message?: string; errors?: Partial<Record<AspirationField, string>> };
      if (response.ok && receipt.code === 'ASPIRATION_RECEIVED') {
        form.reset(); dirty = false; requestId = ''; previousPayload = '';
        counter.textContent = `0 / ${formatter.format(3000)} karakter`;
        status.textContent = 'Terima kasih. Aspirasimu sudah diterima pengurus OSIS.';
        notify({
          id: 'aspiration-received', kind: 'success', title: 'Terima kasih atas aspirasimu.',
          message: 'Suaramu membantu kita membuat SMK Diponegoro 01 lebih baik. Pengurus OSIS sudah menerima masukanmu.',
          announce: false,
        });
      } else {
        fields.disabled = false;
        if (receipt.errors) errors(receipt.errors);
        status.textContent = receipt.message ?? 'Pengiriman belum dapat dikonfirmasi. Tunggu sebentar, lalu coba lagi.';
      }
    } catch {
      status.textContent = 'Pengiriman belum dapat dikonfirmasi. Isianmu tetap ada; periksa koneksi dan coba lagi tanpa memuat ulang halaman.';
    } finally {
      busy = false;
      fields.disabled = false;
      form.removeAttribute('aria-busy');
      spinner.hidden = true;
      buttonLabel.textContent = 'Kirim aspirasi';
      token = '';
      updateOther();
      if (widgetId !== undefined) api?.reset(widgetId);
      if (!dirty) button.focus();
    }
  });
}
