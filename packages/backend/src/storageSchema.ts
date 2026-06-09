import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const metadataTable = sqliteTable('metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const roomsTable = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  maxPlayers: integer('max_players').notNull(),
  winner: integer('winner'),
  finishReason: text('finish_reason'),
  settingsJson: text('settings_json').notNull(),
  password: text('password'),
  clockJson: text('clock_json').notNull(),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  updatedAt: integer('updated_at').notNull(),
})

export const sessionsTable = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => roomsTable.id, { onDelete: 'cascade' }),
  player: integer('player').notNull(),
  nickname: text('nickname'),
  lastSeenAt: integer('last_seen_at').notNull(),
})

export const actionsTable = sqliteTable('actions', {
  roomId: text('room_id').notNull().references(() => roomsTable.id, { onDelete: 'cascade' }),
  actionIndex: integer('action_index').notNull(),
  actionJson: text('action_json').notNull(),
}, table => [
  primaryKey({ columns: [table.roomId, table.actionIndex] }),
])

export const storageSchema = {
  actionsTable,
  metadataTable,
  roomsTable,
  sessionsTable,
}

export type RoomRow = typeof roomsTable.$inferSelect
export type SessionRow = typeof sessionsTable.$inferSelect
export type ActionRow = typeof actionsTable.$inferSelect
export type MetadataRow = typeof metadataTable.$inferSelect
