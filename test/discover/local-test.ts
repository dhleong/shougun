import * as chai from "chai";
import chaiSubset from "chai-subset";
import mockFs from "mock-fs";

import { IDiscovery } from "../../src/discover/base";
import { LocalDiscovery } from "../../src/discover/local";
import { MediaType } from "../../src/model";
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

            "Serenity": dir(
                "movie.mp4",
            ),
        } });
    });

    after(() => {
        mockFs.restore();
    });

    let disco: IDiscovery;

    beforeEach(() => {
        disco = new LocalDiscovery("Movies");
    });

    it("discovers series distinct from movies", async () => {
        const a = await toArray(disco.discover());
        a.should.have.length.at.least(2);
        a.should.containSubset([{
            id: "firefly",
            title: "Firefly",
            type: MediaType.Series,
        }]);

        a.should.containSubset([{
            id: "rando",
            title: "Rando",
            type: MediaType.Movie,
        }]);
    });

    it("discovers series with 'specials'", async () => {
        const a = await toArray(disco.discover());
        a.should.have.length.at.least(2);
        a.should.containSubset([{
            title: "Nodame",
            type: MediaType.Series,

            seasons: [
                { title: undefined, id: "nodame:nodame" },
                { title: "SPECIAL", id: "nodame:special" },
            ],
        }]);
    });

    it("discovers movies in their own folder", async () => {
        const a = await toArray(disco.discover());
        a.should.have.length.at.least(2);
        a.should.containSubset([{
            title: "Serenity",
            type: MediaType.Movie,
        }]);
    });
});
