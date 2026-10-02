import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const aspirations = sqliteTable('aspirations', {
  id: text('id').primaryKey(),
  category: text('category', { enum: ['kegiatan', 'fasilitas', 'osis', 'lainnya'] }).notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status', { enum: ['new', 'reviewed', 'archived'] }).notNull().default('new'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
}, table => [
  index('aspirations_status_created_idx').on(table.status, table.createdAt),
  check('category_valid', sql`${table.category} IN ('kegiatan', 'fasilitas', 'osis', 'lainnya')`),
  check('status_valid', sql`${table.status} IN ('new', 'reviewed', 'archived')`),
  check('subject_length', sql`length(${table.subject}) BETWEEN 3 AND 120`),
  check('message_length', sql`length(${table.message}) BETWEEN 10 AND 3000`),
]);

export type Aspiration = typeof aspirations.$inferSelect;
export type NewAspiration = typeof aspirations.$inferInsert;
