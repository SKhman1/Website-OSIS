export const aspirationCategories = [
  { value: 'kegiatan', label: 'Kegiatan sekolah' },
  { value: 'fasilitas', label: 'Fasilitas' },
  { value: 'osis', label: 'OSIS' },
  { value: 'lainnya', label: 'Yang lain' },
] as const;

export type AspirationField = 'categories' | 'otherCategory' | 'subject' | 'message';
export interface AspirationPayload {
  categories: string[];
  otherCategory: string;
  subject: string;
  message: string;
}

export function validateAspiration(input: unknown): {
  data?: AspirationPayload;
  errors: Partial<Record<AspirationField, string>>;
} {
  const errors: Partial<Record<AspirationField, string>> = {};
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  if (!categories.length || categories.length > 4 ||
      categories.some(value => !aspirationCategories.some(category => category.value === value)) ||
      new Set(categories).size !== categories.length) {
    errors.categories = 'Pilih setidaknya satu kategori yang sesuai.';
  }
  const text = (key: string) => typeof raw[key] === 'string' ? raw[key].trim() : '';
  const otherCategory = categories.includes('lainnya') ? text('otherCategory') : '';
  const subject = text('subject');
  const message = text('message');
  if (categories.includes('lainnya') && (!otherCategory || otherCategory.length > 120)) {
    errors.otherCategory = 'Tulis kategori lainnya, maksimal 120 karakter.';
  }
  if ((raw.subject !== undefined && typeof raw.subject !== 'string') || subject.length > 120) {
    errors.subject = 'Judul boleh dikosongkan, maksimal 120 karakter.';
  }
  if (!message || message.length > 3000) {
    errors.message = 'Tulis aspirasimu, maksimal 3.000 karakter.';
  }
  return Object.keys(errors).length ? { errors } : {
    data: { categories: categories as string[], otherCategory, subject, message }, errors,
  };
}
