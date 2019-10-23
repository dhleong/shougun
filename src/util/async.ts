export async function mergeIterables<T>(iterablePromises: Array<Promise<Iterable<T>>>) {
    const iterables = await Promise.all(iterablePromises);
    const results: T[] = [];
    return results.concat(...iterables.map(it => Array.from(it)));
}
