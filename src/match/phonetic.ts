import _debug from "debug";

import slug from "speakingurl";
import jaroWinkler from "talisman/metrics/jaro-winkler";
import metaphone from "talisman/phonetics/double-metaphone";

import { ScoreBasedMatcher } from "./base";
import { Scorer } from "./scorer";

const debug = _debug("shougun:phonetic");

function process(text: string) {
    // NOTE: Metaphone seemed to give the most useful
    // results for long titles, and is suited for operation
    // on more than just people's names, unlike most other
    // phoneme algorithms
    // We use the double metaphone algorithm, picking the
    // primary encoding and replacing X with S to be a bit
    // more forgiving of weird mic issues.
    return text
        .split(" ")
        .map((word) => metaphone(word)[0])
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
    protected scorer<T>(input: string, keyFn: (item: T) => string) {
        const inputSlug = slug(input);
        const target = process(input);
        return new Scorer<T>((item) => {
            const itemKey = keyFn(item);
            const processed = process(itemKey);

            // NOTE: we use the Jaro-Winkler distance here instead
            // of Levenshtein because in some tests on local data
            // it experimentally provided better, more consistent
            // results.
            let score = jaroWinkler.custom(winklerParams, target, processed);

            // NOTE: boost the score of exact slug matches. As an example,
            // for the query "brave," both the Disney movie "Brave" and the
            // anime "Brave 10" are exact phonetic matches, but given that
            // the query doesn't include the numbers, "Brave 10" should not
            // have as high of a score.
            // Future work might translate numbers in titles to their phonetic
            // equivalents for more natural scoring here....
            if (inputSlug === slug(itemKey)) {
                score *= 1.1;
            }

            debug(target, "VS", processed, "\t", score);
            return score;
        });
    }
}
