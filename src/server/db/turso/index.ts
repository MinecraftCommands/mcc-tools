import type { ZodType } from "zod";
import { env } from "~/env";
import { fetchAndParse, type FetchAndParseResult } from "~/lib/fetch";
import { err, type Err } from "~/lib/result";
import { DATABASE_INFO_SCHEMA, ERROR_RESPONSE_SCHEMA } from "./schemas";

async function tursoFetch<TSchema extends ZodType>(
  path: string,
  schema: TSchema,
): Promise<
  FetchAndParseResult<TSchema, typeof ERROR_RESPONSE_SCHEMA> | Err<string>
> {
  const { TURSO_ORG_SLUG, TURSO_AUTH_TOKEN } = env;
  if (!TURSO_ORG_SLUG || !TURSO_AUTH_TOKEN) {
    return err("No Turso info, are you running in development?");
  }

  return await fetchAndParse(
    `https://api.turso.tech/v1/organizations/${TURSO_ORG_SLUG}/${path}`,
    schema,
    {
      method: "get",
      headers: new Headers({
        Authorization: `Bearer ${TURSO_AUTH_TOKEN}`,
      }),
    },
    ERROR_RESPONSE_SCHEMA,
  );
}

export async function retrieveDatabase(dbName: string) {
  return tursoFetch(`databases/${dbName}`, DATABASE_INFO_SCHEMA);
}
