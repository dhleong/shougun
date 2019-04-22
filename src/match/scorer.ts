export enum ScoreMode {
    Highest,
    Lowest,
}

export class Scorer<T> {
    constructor(
        private computeScore: (item: T) => T | number | undefined,
        private mode = ScoreMode.Highest,
    ) {}

    public findBest(
        items: Iterable<T>,
    ) {
        let best: T | undefined;
        let bestScore = this.mode === ScoreMode.Highest
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
                (this.mode === ScoreMode.Highest && score > bestScore)
                    || (this.mode === ScoreMode.Lowest && score < bestScore)
            ) {
                bestScore = score;
                best = item;
            }
        }

        return best;
    }
}
