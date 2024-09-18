import { useCallback, useRef, type ForwardedRef } from "react";

export function setRef<T>(ref: ForwardedRef<T>, value: T) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

export function useComposedRefs<T>(...refs: ForwardedRef<T>[]) {
  return useCallback(
    (value: T | null) => refs.forEach((ref) => setRef(ref, value)),
    [refs],
  );
}

export function useWrappedRef<T>(ref: ForwardedRef<T>) {
  const savedRef = useRef<T>(null);
  const composed = useComposedRefs(ref, savedRef);
  return { setRef: composed, refValue: savedRef };
}
