import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "~/env";
import * as schema from "./schema";
import { retrieveDatabase } from "./turso";
import { previewDbId } from "./utils";
import { fetchAndParseErrToString } from "~/lib/fetch";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  client: Client | undefined;
};

export async function getDbCredentials(): Promise<{
  url: string;
  authToken?: string;
}> {
  const {
    VERCEL_GIT_PULL_REQUEST_ID: prNum,
    VERCEL_GIT_COMMIT_REF: branchName,
    NODE_ENV,
    DATABASE_URL,
    TURSO_AUTH_TOKEN,
  } = env;

  if (
    NODE_ENV !== "production" ||
    typeof prNum === "undefined" ||
    !branchName ||
    branchName === "main"
  ) {
    return {
      url: DATABASE_URL,
      authToken: TURSO_AUTH_TOKEN,
    };
  }

  // Fetch hostname for the preview database from the Turso platform API
  const dbInfo = await retrieveDatabase(previewDbId(prNum, branchName));
  if (!dbInfo.success) {
    throw new Error(fetchAndParseErrToString(dbInfo, (e) => e.error));
  }

  return {
    url: `https://${dbInfo.data.Hostname}`,
    authToken: TURSO_AUTH_TOKEN,
  };
}

export const client =
  globalForDb.client ?? createClient(await getDbCredentials());
if (env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema });
