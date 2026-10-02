// Shared across the local Node route and Cloudflare Pages Function.
// Phase one never reads, logs, or stores a submission body.
export function closedAspirationsResponse(method: string): Response {
  if (method !== 'POST') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
    });
  }

  return Response.json({
    code: 'ASPIRATIONS_NOT_OPEN',
    message: 'Ruang aspirasi belum dibuka. Silakan kembali lagi nanti.',
  }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
