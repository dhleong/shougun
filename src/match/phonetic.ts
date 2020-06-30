import _debug from "debug";
const debug = _debug("shougun:phonetic");

import jaroWinkler from "talisman/metrics/jaro-winkler";
import metaphone from "talisman/phonetics/double-metaphone";

import { ScoreBasedMatcher } from "./base";
import { Scorer } from "./scorer";

function process(text: string) {
    // NOTE: Metaphone seemed to give the most useful
    // results for long titles, and is suited for operation
    // on more than just people's names, unlike most other
    // phoneme algorithms
    // We use the double metaphone algorithm, picking the
    // primary encoding and replacing X with S to be a bit
    // more forgiving of weird mic issues.
    return text.split(" ")
        .map(word => metaphone(word)[0])
        .join("")
        .replace(/X/g, "S");
}

const winklerParams = {
    // extra points for leading string matches
    scalingFactor: 0.2,
};

/**
 * The PhoneticMatcher is useful for cases where input is provided by
 * a voice input system, such as Google Assistant, that doesn't know
 * anything about your library, and when your library contains titles
 * in foreign languages. Since the input is totally unrelated to the
 * actual titles, but (hopefully) *sounds like* your titles, this
 * matcher converts titles and input to a phonetic representation to
 * try to find the closest *sounding* match.
 */
export class PhoneticMatcher extends ScoreBasedMatcher {
    protected scorer<T>(
        input: string,
        keyFn: (item: T) => string,
    ) {
        const target = process(input);
        return new Scorer<T>(item => {
            const processed = process(keyFn(item));

            // NOTE: we use the Jaro-Winkler distance here instead
            // of Levenshtein because in some tests on local data
            // it experimentally provided better, more consistent
            // results.
            const score = jaroWinkler.custom(
                winklerParams, target, processed,
            );

            debug(target, "VS", processed, "\t", score);
            return score;
        });
    }

}
