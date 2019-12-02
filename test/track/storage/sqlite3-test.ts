import * as chai from "chai";
import chaiSubset from "chai-subset";

import { ITakeoutTrackCreate } from "../../../src/track/base";
import { IViewedInformation } from "../../../src/track/persistent";
import { Sqlite3Storage } from "../../../src/track/storage/sqlite3";
import { toArray } from "../../discover/util";

chai.use(chaiSubset);
chai.should();

const seriesId = "firefly";

describe("Sqlite3Storage", () => {

    let storage: Sqlite3Storage;

    beforeEach(() => {
        storage = Sqlite3Storage.inMemory();
    });

    afterEach(() => {
        storage.close();
    });

    it("can save and load by id", async () => {
        const original = {
            id: "my-id",
            title: "My Title",

            lastViewedTimestamp: 0,
            resumeTimeSeconds: 0,
            videoDurationSeconds: 0,
        };

        storage.save(original);
        const result = await storage.loadById("my-id");
        if (result == null) {
            throw new Error("Should not be null");
        }

        result.should.deep.equal(original);
    });

    it("supports updating info", async () => {
        const original = {
            id: "my-id",
            title: "My Title",

            lastViewedTimestamp: 0,
            resumeTimeSeconds: 0,
            videoDurationSeconds: 0,
        };

        storage.save(original);

        const updated = Object.assign({}, original, {
            resumeTimeSeconds: 42,
        });
        storage.save(updated);

        const result = await storage.loadById("my-id");
        if (result == null) {
            throw new Error("Should not be null");
        }
        result.should.deep.equal(updated);
    });

    it("loads latest viewed by timestamp", async () => {
        const latest = episodeWith({
            id: "first",
            lastViewedTimestamp: 9001,
        });
        const oldest = episodeWith({
            id: "second",
            lastViewedTimestamp: 42,
        });

        storage.save(latest);
        storage.save(oldest);

        const result = await storage.loadLastViewedForSeries(seriesId);
        if (result == null) {
            throw new Error("Should not be null");
        }
        result.should.deep.equal(latest);
    });

    it("queryRecent properly sorts by most recently watched", async () => {
        const oldest = episodeWith({
            id: "oldest",
            lastViewedTimestamp: 42,
        });

        const otherSeries = episodeWith({
            id: "other-series",
            lastViewedTimestamp: 500,
            seriesId: "good-place",
        });

        const latest = episodeWith({
            id: "latest",
            lastViewedTimestamp: 9001,
        });

        storage.save(oldest);
        storage.save(otherSeries);
        storage.save(latest);

        const result = await toArray(storage.queryRecent());
        if (result == null) {
            throw new Error("Should not be null");
        }
        result[0].should.deep.equal(latest);
    });

    it("retrieveBorrowed fetches watches after", async () => {
        const beforeTakeout = episodeWith({
            id: "before-takeout",
            lastViewedTimestamp: 0,
        });

        storage.save(beforeTakeout);
        storage.createTakeout({
            createdTimestamp: 200,
            serverId: "serenity",
            token: "firefly",
        } as ITakeoutTrackCreate);

        const afterTakeout = episodeWith({
            id: "after-takeout",
            lastViewedTimestamp: 500,
            seriesId: "good-place",
        });
        storage.save(afterTakeout);

        const borrowedData = await storage.retrieveBorrowed();
        borrowedData.should.containSubset({
            tokens: [{
                serverId: "serenity",
                token: "firefly",
            }],
            viewedInformation: [{
                id: "after-takeout",
                lastViewedTimestamp: 500,
                seriesId: "good-place",
            }],
        });
    });

    it("returnBorrowed works", async () => {
        await storage.createTakeout({
            createdTimestamp: 200,
            serverId: "serenity",
            token: "firefly",
        } as ITakeoutTrackCreate);

        await storage.returnBorrowed(["firefly"], [
            {
                id: "after-takeout",
                seriesId: "good-place",
                title: "After Takeout",

                lastViewedTimestamp: 500,
                resumeTimeSeconds: 0,
                videoDurationSeconds: 500,
            },
        ]);

        const data = await storage.retrieveBorrowed();
        data.tokens.should.be.empty;
        data.viewedInformation.should.be.empty;

        const info = await storage.loadLastViewedForSeries("good-place");
        if (!info) throw new Error("Should have viewedInfo");

        info.should.containSubset({
            id: "after-takeout",
            seriesId: "good-place",
        });
    });
});

function episodeWith(
    extra: Partial<IViewedInformation> = {},
) {
    return {
        id: "id",
        seriesId,
        title: "Mighty fine Shindig",

        lastViewedTimestamp: 9001,
        resumeTimeSeconds: 0,
        videoDurationSeconds: 0,

        ...extra,
    };
}
