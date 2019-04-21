import leven from "leven";

import { IMatcher } from "../match";

/**
 * The default matcher works well when the input
 * can be expected to be reasonably similar to
 * the target, for example if the user typed their
 * search query.
 */
export class DefaultMatcher implements IMatcher {
    public findBest<T>(
        input: string,
        items: Iterable<T>,
        keyFn: (item: T) => string,
    ): T | undefined {
        const target = input.toLowerCase();
        const parts = target
            .split(/[ ]+/)
            .filter(part => part.length > 3);

        let best: T | undefined;
        let bestScore = -1;

        for (const item of items) {
            const key = keyFn(item);
            const candidate = key.toLowerCase();
            if (!parts.some(p => candidate.includes(p))) {
                continue;
            }

            const distance = leven(
                candidate,
                target,
            );
            if (distance === 0) {
                // probably a safe bet?
                return item;
            }

            const score = 1 / distance;
            if (score > bestScore) {
                bestScore = score;
                best = item;
            }
        }

        return best;
    }
}
