import type { APIRoute } from 'astro';
import { closedAspirationsResponse } from '../aspirations';

export const prerender = false;

// Phase 1: fail closed. Removing the disabled form in DevTools cannot enable
// submissions. No request bodies are read, logged, or persisted in this phase.
export const POST: APIRoute = () => closedAspirationsResponse('POST');

// Never expose private submissions through a public read route.
export const ALL: APIRoute = ({ request }) => closedAspirationsResponse(request.method);
