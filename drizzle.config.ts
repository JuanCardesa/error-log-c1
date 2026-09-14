import type { Config } from 'drizzle-kit';

import { DB_FILE } from './src/lib/db/paths';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url: DB_FILE },
  strict: true,
  verbose: true,
} satisfies Config;
