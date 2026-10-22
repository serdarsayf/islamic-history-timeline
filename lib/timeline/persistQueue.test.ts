import assert from "node:assert/strict";
import test from "node:test";
import { createPersistQueue, onPersistError } from "./persistQueue";

function stubWindow(failKeys: Set<string>) {
  const store = new Map<string, string>();
  const target = new EventTarget() as EventTarget & { localStorage: unknown };
  target.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failKeys.has(key)) throw new Error("QuotaExceededError");
      store.set(key, value);
    },
  };
  (globalThis as { window?: unknown }).window = target;
  return { target, store };
}

test("one queue's success does not clear another queue's failure", () => {
  const failKeys = new Set(["failing"]);
  const { target, store } = stubWindow(failKeys);
  const messages: Array<string | null> = [];
  const unsubscribe = onPersistError((message) => messages.push(message));
  const failing = createPersistQueue<number[]>({ key: "failing", label: "failing data", onWritten: () => {} });
  const working = createPersistQueue<number[]>({ key: "working", label: "working data", onWritten: () => {} });

  failing.schedule([1]);
  working.schedule([2]);
  target.dispatchEvent(new Event("pagehide"));

  assert.equal(store.get("working"), "[2]");
  assert.equal(failing.hasPending(), true);
  assert.equal(working.hasPending(), false);
  assert.equal(messages.length, 1);
  assert.match(String(messages[0]), /Could not save failing data/);

  failKeys.clear();
  target.dispatchEvent(new Event("pagehide"));

  assert.equal(store.get("failing"), "[1]");
  assert.deepEqual(messages.slice(1), [null]);
  unsubscribe();
});

test("listeners are detached once nothing is pending", () => {
  const { target } = stubWindow(new Set());
  let writes = 0;
  const queue = createPersistQueue<number[]>({ key: "k", label: "data", onWritten: () => { writes += 1; } });

  queue.schedule([1]);
  target.dispatchEvent(new Event("pagehide"));
  target.dispatchEvent(new Event("pagehide"));

  assert.equal(writes, 1);
});
