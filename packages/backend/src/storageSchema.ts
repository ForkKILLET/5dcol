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
  initialMultiverseJson: text('initial_multiverse_json'),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  updatedAt: integer('updated_at').notNull(),
})

export const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  nickname: text('nickname'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const sessionsTable = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
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

export const studyRoomsTable = sqliteTable('study_rooms', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  private: integer('private', { mode: 'boolean' }).notNull(),
  documentJson: text('document_json').notNull(),
  membersJson: text('members_json').notNull(),
  version: integer('version').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const chatMessagesTable = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  roomKind: text('room_kind').notNull(),
  roomId: text('room_id').notNull(),
  userId: text('user_id').notNull(),
  nickname: text('nickname'),
  text: text('text').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const storageSchema = {
  actionsTable,
  chatMessagesTable,
  metadataTable,
  roomsTable,
  sessionsTable,
  studyRoomsTable,
  usersTable,
}

export type RoomRow = typeof roomsTable.$inferSelect
export type SessionRow = typeof sessionsTable.$inferSelect
export type ActionRow = typeof actionsTable.$inferSelect
export type StudyRoomRow = typeof studyRoomsTable.$inferSelect
export type ChatMessageRow = typeof chatMessagesTable.$inferSelect
export type MetadataRow = typeof metadataTable.$inferSelect
export type UserRow = typeof usersTable.$inferSelect
