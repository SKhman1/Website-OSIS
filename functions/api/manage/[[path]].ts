import { handleCms, type CmsEnv } from '../../../src/server/cms';
export function onRequest({request,env}: {request:Request;env:CmsEnv}) { return handleCms(request,env); }
