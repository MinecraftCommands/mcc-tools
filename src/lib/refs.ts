import { useCallback, useRef, type Ref } from "react";

export function setRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

export function useComposedRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return useCallback(
    (value: T | null) => refs.forEach((ref) => setRef(ref, value)),
    [refs],
  );
}

export function useWrappedRef<T>(ref: Ref<T> | undefined) {
  const savedRef = useRef<T>(null);
  const composed = useComposedRefs(ref, savedRef);
  return { setRef: composed, refValue: savedRef };
}
