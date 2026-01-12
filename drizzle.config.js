/** @type { import("drizzle-kit").Config } */
export default {
  schema: './utils/Schema.js',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NEXT_PUBLIC_DRIZZLE_DATABASE_URL,
  },
}
