import { closedAspirationsResponse } from '../../src/server/aspirations';

export function onRequest({ request }: { request: Request }): Response {
  return closedAspirationsResponse(request.method);
}
