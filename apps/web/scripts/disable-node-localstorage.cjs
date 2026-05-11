// Node.js v25+ ships a built-in localStorage whose property descriptor uses a
// getter.  Accessing that getter triggers an internal initialization that prints
// "was provided without a valid path" and returns {} — an object that has no
// getItem/setItem methods.  Next.js dev-mode SSR code (e.g. preferences.js in
// the dev overlay) calls localStorage.getItem() on the server, which then throws
// [TypeError: localStorage.getItem is not a function] and produces HTTP 500.
//
// Fix: intercept the descriptor BEFORE the getter fires, and replace it with a
// lightweight no-op Storage shim.  Callers see proper methods (returning null),
// the dev overlay stores/reads nothing, and the SSR render succeeds.
try {
  const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const needsShim =
    // Node v25+: a getter that returns {} without functional methods
    desc?.get != null ||
    // Older node-localstorage that provides an object with broken getItem
    (desc?.value != null && typeof desc.value.getItem !== "function");

  if (needsShim) {
    const noop = Object.create(null);
    noop.getItem = () => null;
    noop.setItem = () => undefined;
    noop.removeItem = () => undefined;
    noop.clear = () => undefined;
    noop.key = () => null;
    noop.length = 0;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      enumerable: false,
      value: noop,
      writable: true,
    });
  }
} catch {
  try {
    delete globalThis.localStorage;
  } catch {
    // Best effort: Next.js SSR should run without a Node-side localStorage object.
  }
}
