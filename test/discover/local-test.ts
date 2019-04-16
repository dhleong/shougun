import * as chai from "chai";
import mockFs from "mock-fs";

import { IDiscovery } from "../../src/discover/base";
import { LocalDiscovery } from "../../src/discover/local";
import { IServer } from "../../src/playback/serve";
import { toArray } from "./util";

chai.should();

function dir(...fileNames: string[]) {
    return fileNames.reduce((m, fileName) => {
        m[fileName] = "";
        return m;
    }, {} as {[n: string]: string});
}

describe("LocalDiscovery", () => {
    before(() => {
        mockFs({ Movies: {
            Firefly: dir(
                "one.mp4",
                "two.mkv",
                "three.avi",
            ),
        } });
    });

    after(() => {
        mockFs.restore();
    });

    let disco: IDiscovery;

    beforeEach(() => {
        const server = {} as IServer;
        disco = new LocalDiscovery(server, "Movies");
    });

    it("discovers episodes", async () => {
        const a = await toArray(disco.discover());
        a.should.not.be.empty;
    });
});
