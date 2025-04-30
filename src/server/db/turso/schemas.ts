import { z } from "zod";

export const DATABASE_INFO_SCHEMA = z.object({
  Name: z.string(),
  DbId: z.string().uuid(),
  Hostname: z.string(), // hostname doesn't have the URL scheme, so can't be validated as url
  block_reads: z.boolean(),
  block_writes: z.boolean(),
  allow_attach: z.boolean(),
  regions: z.string().array(),
  primaryRegion: z.string(),
  type: z.string().default("logical"),
  version: z.string(),
  group: z.string(),
  is_schema: z.boolean(),
  schema: z.string(),
  archived: z.boolean(),
});

export type DatabaseInfo = z.infer<typeof DATABASE_INFO_SCHEMA>;

export const RETRIEVE_DATABASE_RESPONSE_SCHEMA = z.object({
  database: DATABASE_INFO_SCHEMA,
});

export type RetrieveDatabaseResponse = z.infer<
  typeof RETRIEVE_DATABASE_RESPONSE_SCHEMA
>;

export const ERROR_RESPONSE_SCHEMA = z.object({
  error: z.string(),
});

export type ErrorResponse = z.infer<typeof ERROR_RESPONSE_SCHEMA>;
