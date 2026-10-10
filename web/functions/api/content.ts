import { publicContent, type CmsEnv } from '../../src/server/cms';
export function onRequest({request,env}: {request:Request;env:CmsEnv}) { return publicContent(request,env); }
