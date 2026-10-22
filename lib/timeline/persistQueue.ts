const DEBOUNCE_MS = 150;

const persistErrors = new Map<string, string>();
const persistErrorListeners = new Set<(message: string | null) => void>();

function currentPersistError() {
  return persistErrors.values().next().value ?? null;
}

// `source` keeps one store's success from clearing another store's failure.
function setPersistError(source: string, message: string | null) {
  const before = currentPersistError();
  if (message === null) persistErrors.delete(source);
  else persistErrors.set(source, message);
  const after = currentPersistError();
  if (after !== before) persistErrorListeners.forEach((listener) => listener(after));
}

export function onPersistError(listener: (message: string | null) => void) {
  persistErrorListeners.add(listener);
  return () => {
    persistErrorListeners.delete(listener);
  };
}

type PersistQueueOptions<T> = {
  key: string;
  label: string;
  // Called after a successful write so the caller can mark its cache as matching storage.
  onWritten: (raw: string, value: T) => void;
};

// Debounced localStorage writer. A failed write stays pending and is retried by the next schedule or flush.
export function createPersistQueue<T>({ key, label, onWritten }: PersistQueueOptions<T>) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;
  let listening = false;

  function handleVisibility() {
    if (typeof document === "undefined" || document.visibilityState === "hidden") flush();
  }

  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("visibilitychange", handleVisibility);
  }

  function stopListening() {
    if (!listening) return;
    listening = false;
    window.removeEventListener("beforeunload", flush);
    window.removeEventListener("pagehide", flush);
    window.removeEventListener("visibilitychange", handleVisibility);
  }

  function flush() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (pending === null) {
      stopListening();
      return;
    }

    const value = pending;
    try {
      const raw = JSON.stringify(value);
      window.localStorage.setItem(key, raw);
      pending = null;
      onWritten(raw, value);
      stopListening();
      setPersistError(key, null);
    } catch (error) {
      setPersistError(
        key,
        error instanceof Error && error.message
          ? `Could not save ${label}: ${error.message}`
          : `Could not save ${label} to browser storage.`
      );
    }
  }

  return {
    schedule(value: T) {
      pending = value;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
      listen();
    },
    flush,
    hasPending: () => pending !== null,
  };
}
