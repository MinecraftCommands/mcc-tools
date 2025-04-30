import type { z, ZodError, ZodType } from "zod";

export type Ok<T> = {
  success: true;
  data: T;
  error?: never;
};

export function ok<T>(data: T): Ok<T> {
  return {
    success: true,
    data,
  };
}

export type Err<T> = {
  success: false;
  data?: never;
  error: T;
};

export function err<T>(error: T): Err<T> {
  return {
    success: false,
    error,
  };
}

/**
 * A general success/failure that is structurally compatible with the result of Zod's safeParse
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

export type ParseResult<TSchema extends ZodType, TErr = never> = Result<
  z.infer<TSchema>,
  ZodError<z.input<TSchema>> | TErr
>;

export type ErrType<T> = T extends Err<infer E> ? E : never;
export type OkType<T> = T extends Ok<infer V> ? V : never;
