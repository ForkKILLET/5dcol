import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/storageSchema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.MATCH_DATABASE_FILE ?? './data/rooms.sqlite',
  },
})
