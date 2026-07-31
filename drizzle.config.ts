import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.APP_DATA_DIR ? `${process.env.APP_DATA_DIR}/app.db` : './data/app.db',
  },
  verbose: true,
  strict: true,
})