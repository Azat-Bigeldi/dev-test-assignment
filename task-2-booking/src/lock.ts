// @rev kc-31
export function createKeyedLock() {
  const tails = new Map<string, Promise<unknown>>();

  return async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    const run = prev.then(task, task);
    const tail = run.catch(() => {});
    tails.set(key, tail);
    try {
      return await run;
    } finally {
      if (tails.get(key) === tail) tails.delete(key);
    }
  };
}
