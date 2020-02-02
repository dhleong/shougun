/**
 * Given an array of Promises that each may emit a value `T`, returns a
 * Promise that returns the first non-`undefined` `T` emitted amonst those
 * Promises, or `undefined` if they all emitted `undefined`
 */
export async function anyPromise<T>(promises: Array<Promise<T | undefined>>): Promise<T | undefined> {
    // TODO: we could probably optimize this to start each promise in parallel,
    // but this is fine for now....
    for (const p of promises) {
        const value = await p;
        if (value !== undefined) return value;
    }
}
