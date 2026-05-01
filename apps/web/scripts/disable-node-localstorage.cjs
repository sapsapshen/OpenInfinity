try {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = globalThis.localStorage;

  if (storage && typeof storage.getItem !== "function") {
    if (descriptor?.configurable !== false) {
      delete globalThis.localStorage;
    } else {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: undefined,
        writable: true,
      });
    }
  }
} catch {
  try {
    delete globalThis.localStorage;
  } catch {
    // Best effort: Next.js SSR should run without a Node-side localStorage object.
  }
}
