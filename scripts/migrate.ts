import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const url = process.env.DATABASE_URL || 'file:./data/osis.db';
if (url === 'file:./data/osis.db') await mkdir('./data', { recursive: true });
const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('Database migrations applied.');
} finally {
  client.close();
}
