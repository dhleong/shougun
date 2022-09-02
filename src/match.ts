export interface IMatcher {
    findBest<T>(
        input: string,
        items: Iterable<T>,
        keyFn: (item: T) => string,
    ): T | undefined;

    sort<T>(input: string, items: T[], keyFn: (item: T) => string): T[];
}
