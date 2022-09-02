export function groupBy<T, TKey extends string>(
    iterable: T[],
    keyFn: (item: T) => TKey,
) {
    const grouped: { [key in TKey]?: T[] } = {};
    for (const item of iterable) {
        const key = keyFn(item);
        const existing = grouped[key];

        let array: T[];
        if (existing) {
            array = existing as T[];
        } else {
            const newArray: T[] = [];
            array = newArray;
            grouped[key] = newArray;
        }

        array.push(item);
    }
    return grouped;
}
