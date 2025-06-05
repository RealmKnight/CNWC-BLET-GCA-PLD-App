import { useEffect, useLayoutEffect } from "react";

// On the server, React emits a warning when using useLayoutEffect.
// This is because useLayoutEffect runs synchronously in the browser
// but is deferred on the server, which would cause a mismatch.
// To avoid this, we use useEffect on the server and useLayoutEffect in the browser.
export const useIsomorphicLayoutEffect = typeof window !== "undefined"
    ? useLayoutEffect
    : useEffect;
