import { publicFavicon, type CmsEnv } from '../../src/server/cms';
export function onRequest({request,env}:{request:Request;env:CmsEnv}){return publicFavicon(request,env);}
