import { unstable_cache } from "next/cache";
import SuperJSON from "superjson";
import { ZodError, type z, type ZodType } from "zod";
import {
  err,
  type Err,
  type Ok,
  type ParseResult,
  type Result,
} from "./result";
import { fromError } from "zod-validation-error";

SuperJSON.registerClass(ZodError);

export function cache<T extends (...args: never[]) => Promise<unknown>>(
  cb: T,
  keyParts?: Parameters<typeof unstable_cache>[1],
  options?: Parameters<typeof unstable_cache>[2],
) {
  type Params = Parameters<T>;
  // Using Awaited<ReturnType<T>> doesn't seem to satisfy the TS type checker
  type Res = T extends (...args: never[]) => Promise<infer R> ? R : never;

  const serialized = async (...args: Params) => {
    const res = await cb(...args);
    return SuperJSON.stringify(res);
  };

  const cached = unstable_cache(serialized, keyParts, options);

  const deserialized = async (...args: Params) => {
    const json = await cached(...args);
    return SuperJSON.parse<Res>(json);
  };

  return deserialized;
}

async function parseJson<T extends ZodType>(res: Response, schema: T) {
  try {
    const body = (await res.json()) as unknown;
    return await schema.safeParseAsync(body);
  } catch (error) {
    return err(error as TypeError);
  }
}

export type FetchAndParseResult<
  TSchema extends ZodType,
  ESchema extends ZodType = never,
> = ParseResult<
  TSchema,
  TypeError | ([ESchema] extends [never] ? string : ParseResult<ESchema>)
>;

export function fetchAndParseErrToString<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TErr extends Err<TypeError | string | ParseResult<any>>,
>(
  result: TErr,
  ...[errResultToString]: TErr extends Err<infer TOuter>
    ? TOuter extends Ok<infer TInner>
      ? [(value: TInner) => string]
      : never
    : []
) {
  const e = result.error;
  if (typeof e === "string") {
    return e;
  } else if (e instanceof Error) {
    return fromError(e).toString();
  } else if (e.success) {
    return errResultToString(e.data);
  } else {
    return fromError(e.error).toString();
  }
}

export async function fetchAndParse<TSchema extends ZodType>(
  url: string,
  schema: TSchema,
  options?: RequestInit,
): Promise<FetchAndParseResult<TSchema>>;
export async function fetchAndParse<
  TSchema extends ZodType,
  ESchema extends ZodType,
>(
  url: string,
  schema: TSchema,
  options: RequestInit,
  errorSchema: ESchema,
): Promise<FetchAndParseResult<TSchema, ESchema>>;
export async function fetchAndParse<
  TSchema extends ZodType,
  ESchema extends ZodType = never,
>(
  url: string,
  schema: TSchema,
  options: RequestInit = {},
  errorSchema?: ESchema,
): Promise<ParseResult<TSchema, ParseResult<ESchema> | TypeError | string>> {
  const res = await fetch(url, options);
  if (res.ok) {
    return await parseJson(res, schema);
  } else if (errorSchema) {
    return await parseJson(res, errorSchema);
  } else {
    return err(res.statusText);
  }
}
