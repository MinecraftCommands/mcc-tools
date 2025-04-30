import { type Config } from "drizzle-kit";
import "dotenv/config";

import { dbEnv as env } from "~/db-env";

export default {
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
  dialect: "turso",
  dbCredentials: {
    url: env.DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  },
  tablesFilter: ["mcc-gadgets_*"],
} satisfies Config;
