import * as chai from "chai";
import mockFs from "mock-fs";

import { IDiscovery } from "../../src/discover/base";
import { LocalDiscovery } from "../../src/discover/local";
import { IMedia, MediaType } from "../../src/model";
import { IServer } from "../../src/playback/serve";
import { toArray } from "./util";

chai.should();

function dir(...fileNames: string[]) {
    return fileNames.reduce((m, fileName) => {
        m[fileName] = "";
        return m;
    }, {} as {[n: string]: string});
}

async function toSimpleArray(items: AsyncIterable<IMedia>) {
    return (await toArray(items)).map(m => ({
        title: m.title,
        type: m.type,
    }));
}

describe("LocalDiscovery", () => {
    before(() => {
        mockFs({ Movies: {
            "rando.mp4": "",

            "notes.txt": "",

            "Firefly": dir(
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

    it("discovers series distinct from movies", async () => {
        const a = await toSimpleArray(disco.discover());
        a.should.have.lengthOf(2);
        a.should.deep.include({
            title: "Firefly",
            type: MediaType.Series,
        });

        a.should.deep.include({
            title: "rando.mp4",
            type: MediaType.Movie,
        });
    });
});
