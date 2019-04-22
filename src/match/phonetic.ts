import _debug from "debug";
const debug = _debug("shougun:phonetic");

import { JaroWinklerDistance, Metaphone } from "natural";

import { IMatcher } from "../match";
import { Scorer } from "./scorer";

function process(text: string) {
    // NOTE: Metaphone seemed to give the most useful
    // results for long titles, and is suited for operation
    // on more than just people's names, unlike most other
    // phoneme algorithms
    return Metaphone.process(text).replace(/ /g, "");
}

/**
 * The PhoneticMatcher is useful for cases where input is provided by
 * a voice input system, such as Google Assistant, that doesn't know
 * anything about your library, and when your library contains titles
 * in foreign languages. Since the input is totally unrelated to the
 * actual titles, but (hopefully) *sounds like* your titles, this
 * matcher converts titles and input to a phonetic representation to
 * try to find the closest *sounding* match.
 */
export class PhoneticMatcher implements IMatcher {
    public findBest<T>(
        input: string,
        items: Iterable<T>,
        keyFn: (item: T) => string,
    ): T | undefined {
        const target = process(input);
        const scorer = new Scorer<T>(item => {
            const processed = process(keyFn(item));

            // NOTE: we use the Jaro-Winkler distance here instead
            // of Levenshtein because in some tests on local data
            // it experimentally provided better, more consistent
            // results.
            const score = JaroWinklerDistance(target, processed);

            debug(target, "VS", processed, "\t", score);
            return score;
        });
        return scorer.findBest(items);
    }

}
