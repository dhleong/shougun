import * as chai from "chai";

import { fileNameToTitle } from "../../src/media/util";

chai.should();

describe("fileNameToTitle", () => {
    it("tries to strip codec and format info", () => {
        fileNameToTitle("Hana yori dango ep08 (704x396 DivX).avi")
            .should.equal("Hana Yori Dango Ep08");

        fileNameToTitle("nodame_cantabile_ep11(D-CX_704x396_DivX6).avi")
            .should.equal("Nodame Cantabile Ep11");
    });
});
