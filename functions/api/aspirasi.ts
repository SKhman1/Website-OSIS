import { handleAspirationRequest, type AspirationEnvironment } from '../../src/server/aspirations';

export function onRequest({ request, env = {} }: { request: Request; env?: AspirationEnvironment }): Promise<Response> {
  return handleAspirationRequest(request, env);
}
