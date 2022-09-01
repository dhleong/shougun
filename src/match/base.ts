import { IMatcher } from "../match";
import { Scorer } from "./scorer";

export abstract class ScoreBasedMatcher implements IMatcher {
    public findBest<T>(
        input: string,
        items: Iterable<T>,
        keyFn: (item: T) => string,
    ): T | undefined {
        return this.scorer(input, keyFn).findBest(items);
    }

    public sort<T>(input: string, items: T[], keyFn: (item: T) => string): T[] {
        return this.scorer(input, keyFn).sort(items);
    }

    protected abstract scorer<T>(
        input: string,
        keyFn: (item: T) => string,
    ): Scorer<T>;
}
