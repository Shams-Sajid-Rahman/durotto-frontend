import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * false during SSR and the hydration render, true afterwards. Lets components
 * read browser-only state (localStorage, matchMedia) without hydration
 * mismatches and without a setState-in-effect round trip.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
