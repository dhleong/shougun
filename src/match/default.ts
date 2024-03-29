import leven from "leven";

import { ScoreBasedMatcher } from "./base";
import { Scorer } from "./scorer";

/**
 * The default matcher works well when the input
 * can be expected to be reasonably similar to
 * the target, for example if the user typed their
 * search query.
 */
export class DefaultMatcher extends ScoreBasedMatcher {
    protected scorer<T>(input: string, keyFn: (item: T) => string) {
        const target = input.toLowerCase();
        const parts = target.split(/[ ]+/).filter((part) => part.length > 3);

        return new Scorer<T>((item) => {
            const key = keyFn(item);
            const candidate = key.toLowerCase();
            if (!parts.some((p) => candidate.includes(p))) {
                // definitely not a match
                return;
            }

            const distance = leven(candidate, target);
            if (distance === 0) {
                // probably a safe bet?
                return item;
            }

            return 1 / distance;
        });
    }
}
