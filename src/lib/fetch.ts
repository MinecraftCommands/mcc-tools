import { unstable_cache } from "next/cache";
import SuperJSON from "superjson";
import { ZodError } from "zod";

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
