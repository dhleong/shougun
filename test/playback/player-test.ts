import * as chai from "chai";

import { formatError } from "../../src/playback/player";

chai.should();
const { expect } = chai;

describe("formatError", () => {
    it("should handle simple errors", () => {
        const error = new Error("Your mouth is talkin', Jayne");
        const formatted = formatError(error);
        formatted.message.should.match(/Your mouth is talkin', Jayne$/);
        expect(formatted.stack).to.not.be.undefined;

        formatted.stack!.should.not.have.match(/Jayne/);
    });

    it("should handle 'Caused by'", () => {
        const error = new Error("This is an error\nCaused by:\nstack");
        const formatted = formatError(error);
        formatted.message.should.match(/This is an error$/);
        formatted.message.should.not.include("Caused by");

        expect(formatted.stack).to.not.be.undefined;
        formatted.stack!.should.have.length.at.least(2);

        expect(formatted.stack!.slice(0, 2)).to.deep.equal([
            "Caused by:",
            "stack",
        ]);
    });
});
