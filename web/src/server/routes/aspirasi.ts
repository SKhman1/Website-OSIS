import 'dotenv/config';
import type { APIRoute } from 'astro';
import { handleAspirationRequest } from '../aspirations';

export const prerender = false;
export const POST: APIRoute = ({ request }) => handleAspirationRequest(request, {
  ASPIRATIONS_ENABLED: process.env.ASPIRATIONS_ENABLED,
  GOOGLE_FORMS_SCRIPT_URL: process.env.GOOGLE_FORMS_SCRIPT_URL,
  GOOGLE_FORMS_SHARED_SECRET: process.env.GOOGLE_FORMS_SHARED_SECRET,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
});
export const ALL: APIRoute = ({ request }) => handleAspirationRequest(request);
