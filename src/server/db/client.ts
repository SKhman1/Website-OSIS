import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

// Server-only module. This is lazy so static page builds don't require secrets.
function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be configured on the server.');
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
  return drizzle(client, { schema });
}

let database: ReturnType<typeof connect> | undefined;
export function getDatabase() {
  return database ??= connect();
}
