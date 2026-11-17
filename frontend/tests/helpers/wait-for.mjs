/** Await a real UI state transition instead of assuming a scheduler's frame time. */
export async function waitFor(predicate, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('UI condition timed out');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
