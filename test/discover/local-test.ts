import * as chai from "chai";
import chaiSubset from "chai-subset";
import mockFs from "mock-fs";

import { IDiscovery } from "../../src/discover/base";
import { LocalDiscovery } from "../../src/discover/local";
import { IMedia, MediaType } from "../../src/model";
import { IServer } from "../../src/playback/serve";
import { toArray } from "./util";

chai.use(chaiSubset);
chai.should();

type DirEntry = [ string, {[n: string]: any} ];
type IEntry = string | DirEntry;

function dir(...fileNames: IEntry[]) {
    return fileNames.reduce((m, entry) => {
        if (typeof entry === "string") {
            m[entry] = "";
        } else {
            const [ fileName, contents ] = entry as DirEntry;
            m[fileName] = contents;
        }
        return m;
    }, {} as {[n: string]: any});
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

            "Nodame": dir(
                [ "SPECIAL", dir(
                    "special.mp4",
                ) ],

                "one.mp4",
                "two.mp4",
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
        a.should.have.length.at.least(2);
        a.should.deep.include({
            title: "Firefly",
            type: MediaType.Series,
        });

        a.should.deep.include({
            title: "rando.mp4",
            type: MediaType.Movie,
        });
    });

    it("discovers series with 'specials'", async () => {
        const a = await toArray(disco.discover());
        a.should.have.length.at.least(2);
        a.should.containSubset([{
            title: "Nodame",
            type: MediaType.Series,

            seasons: [
                { title: undefined },
                { title: "SPECIAL" },
            ],
        }]);
    });
});
