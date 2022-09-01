export enum ScoreMode {
    Highest,
    Lowest,
}

type Comparable = number | object | undefined;

function compareHighest(
    [, scoreA]: [any, Comparable],
    [, scoreB]: [any, Comparable],
) {
    if (!scoreA) return 1;
    if (!scoreB) return -1;
    if (typeof scoreA !== "number") {
        return -1;
    }
    if (typeof scoreB !== "number") {
        return 1;
    }
    return scoreB - scoreA;
}

function compareLowest(
    [, scoreA]: [any, Comparable],
    [, scoreB]: [any, Comparable],
) {
    if (!scoreA) return -1;
    if (!scoreB) return 1;
    if (typeof scoreA !== "number") {
        return 1;
    }
    if (typeof scoreB !== "number") {
        return -1;
    }
    return scoreA - scoreB;
}

export class Scorer<T> {
    constructor(
        private computeScore: (item: T) => T | number | undefined,
        private mode = ScoreMode.Highest,
    ) {}

    public sort(items: T[]) {
        const withScore = items.map(
            (item) => [item, this.computeScore(item)] as [T, Comparable],
        );
        const sorted = withScore.sort(
            this.mode === ScoreMode.Highest ? compareHighest : compareLowest,
        );
        return sorted.map(([item]) => item);
    }

    public findBest(items: Iterable<T>) {
        let best: T | undefined;
        let bestScore =
            this.mode === ScoreMode.Highest
                ? Number.MIN_VALUE
                : Number.MAX_VALUE;

        for (const item of items) {
            const score = this.computeScore(item);
            if (score === undefined) {
                // ignore the item
                continue;
            } else if (typeof score !== "number") {
                // shortcircuit
                return score;
            }

            if (
                (this.mode === ScoreMode.Highest && score > bestScore) ||
                (this.mode === ScoreMode.Lowest && score < bestScore)
            ) {
                bestScore = score;
                best = item;
            }
        }

        return best;
    }
}
