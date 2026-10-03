// Local Astro redirects mirror the permanent Pages rules in public/_redirects.
export const redirects = {
  '/sekbid': '/anggota/seksi-bidang',
  '/seksi-bidang': '/anggota/seksi-bidang',
  '/anggota/pembina-osis': '/anggota/pembina/pembina-osis',
  ...Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
    const id = `sekbid-${String(index + 1).padStart(2, '0')}`;
    return [`/sekbid/${id}`, `/anggota/seksi-bidang/${id}`];
  })),
};
