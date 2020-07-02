import * as chai from "chai";

import { PhoneticMatcher } from "../../src/match/phonetic";

chai.should();

describe("PhoneticMatcher", () => {
    it("scores by sound similarity", () => {
        const matcher = new PhoneticMatcher();
        const sorted = matcher.sort("Malcolm Reynolds", [
            "Reynolds Malcolm",
            "Markum Ranhords",
            "Malcore Reynorts",
            "Malcom Reynolds",
        ], item => item);

        sorted.should.contain.ordered.members([
            "Malcom Reynolds",
            "Malcore Reynorts",
            "Markum Ranhords",
            "Reynolds Malcolm",
        ]);
    });

    it("prefers exact matches", () => {
        const matcher = new PhoneticMatcher();
        const sorted = matcher.sort("brave", [
            "Brave 10",
            "Brave",
        ], item => item);

        sorted.should.contain.ordered.members([
            "Brave",
            "Brave 10",
        ]);
    });
});
