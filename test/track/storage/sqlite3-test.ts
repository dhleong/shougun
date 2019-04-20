import * as chai from "chai";

import sqlite from "better-sqlite3";
import { Sqlite3Storage } from "../../../src/track/storage/sqlite3";

chai.should();

describe("Sqlite3Storage", () => {

    let storage: Sqlite3Storage;

    beforeEach(() => {
        storage = new Sqlite3Storage(
            new sqlite("", { memory: true }),
        );
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
        const first = {
            id: "id1",
            seriesId: "series",
            title: "My Title",

            lastViewedTimestamp: 9001,
            resumeTimeSeconds: 0,
            videoDurationSeconds: 0,
        };

        const second = {
            id: "id2",
            seriesId: "series",
            title: "My Title",

            lastViewedTimestamp: 42,
            resumeTimeSeconds: 0,
            videoDurationSeconds: 0,
        };

        storage.save(first);
        storage.save(second);

        const result = await storage.loadLastViewedForSeries("series");
        if (result == null) {
            throw new Error("Should not be null");
        }
        result.should.deep.equal(first);
    });
});
