import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma CLI configuration.
 *
 * ── WHY THIS DOES NOT USE env('DIRECT_URL') ─────────────────────────────────
 * It used to, and it broke every Vercel deploy with:
 *
 *   PrismaConfigEnvError: Cannot resolve environment variable: DIRECT_URL
 *
 * `env()` throws when the variable is missing, and this file is loaded by EVERY
 * prisma command — including `prisma generate`, which the Vercel build runs and
 * which never opens a database connection at all. So the build died on a value it
 * had no use for. DIRECT_URL was also in nobody's env.example, so there was
 * nothing to tell a new environment it was needed.
 *
 * ── WHICH URL, AND WHY IT MATTERS ───────────────────────────────────────────
 * Two connection strings point at the same Neon database:
 *
 *   DATABASE_URL   the -pooler endpoint. PgBouncer. What the app runs on.
 *   DIRECT_URL     the direct endpoint, bypassing PgBouncer.
 *
 * Schema commands (`db push`, `db pull`, `migrate`) want the direct one. They
 * take advisory locks and issue DDL, and a transaction-pooled connection is not
 * a reliable place to do either.
 *
 * Everything else — `generate` above all — needs no connection, so any value, or
 * none, is fine.
 *
 * Hence: prefer DIRECT_URL, fall back to DATABASE_URL so a build cannot fail over
 * a URL it will not dial, and warn loudly if a command that genuinely needs the
 * direct connection is about to run on the pooled one. Silently pushing schema
 * changes through PgBouncer is exactly the kind of thing that works four times
 * and hangs on the fifth.
 */

const directUrl = process.env.DIRECT_URL
const pooledUrl = process.env.DATABASE_URL
const url = directUrl ?? pooledUrl

/**
 * Commands that actually dial the database to read or change the schema.
 * Compared against the whole argv rather than a fixed position, because the CLI
 * is invoked as `prisma db push`, `npx prisma migrate ...` and via package
 * scripts, and the verb does not sit at the same index in all three.
 */
const SCHEMA_COMMANDS = ['db', 'migrate', 'introspect']
const needsDirectConnection = process.argv.some((arg) =>
  SCHEMA_COMMANDS.includes(arg),
)

if (needsDirectConnection && !directUrl) {
  console.warn(
    '\n[prisma.config] DIRECT_URL is not set, falling back to DATABASE_URL.\n' +
      '  DATABASE_URL is the pooled (-pooler) Neon endpoint. Schema commands take\n' +
      '  advisory locks and issue DDL, which PgBouncer does not reliably support.\n' +
      '  Set DIRECT_URL to the non-pooler endpoint before running this.\n',
  )
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // `datasource` is optional and only consulted by migration and introspection
  // commands. Omitted entirely when neither variable is set, so `generate` still
  // succeeds and a schema command fails with Prisma's own message rather than a
  // confusing one about `undefined`.
  ...(url ? { datasource: { url } } : {}),
})
