import * as chai from "chai";

import { ISeries, MediaType } from "../../src/model";
import { IStorage, PersistentTracker } from "../../src/track/persistent";
import { Sqlite3Storage } from "../../src/track/storage/sqlite3";

chai.should();

describe("PersistentTracker", () => {

    let storage: IStorage;

    // just use sqlite3 for now...
    beforeEach(() => {
        storage = Sqlite3Storage.inMemory();
    });

    afterEach(() => {
        storage.close();
    });

    describe("pickResumeForMedia", () => {
        it("handles unwatched series", async () => {
            const series = seriesWithId("series");

            const tracker = new PersistentTracker(storage);
            const track = await tracker.pickResumeForMedia(series);
            track.media.id.should.equal("episode-0");
            track.should.not.have.property("resumeTimeSeconds");
        });

        it("starts barely-watched video from beginning", async () => {
            storage.save({
                id: "episode-0",
                seriesId: "series",
                title: "title",

                lastViewedTimestamp: 0,
                resumeTimeSeconds: 4,
                videoDurationSeconds: 400,
            });

            const series = seriesWithId("series");

            const tracker = new PersistentTracker(storage);
            const track = await tracker.pickResumeForMedia(series);
            track.media.id.should.equal("episode-0");
            track.should.not.have.property("resumeTimeSeconds");
        });

        it("resumes in-progress video", async () => {
            storage.save({
                id: "episode-0",
                seriesId: "series",
                title: "title",

                lastViewedTimestamp: 0,
                resumeTimeSeconds: 100,
                videoDurationSeconds: 400,
            });

            const series = seriesWithId("series");

            const tracker = new PersistentTracker(storage);
            const track = await tracker.pickResumeForMedia(series);
            track.media.id.should.equal("episode-0");
            track.should.have.property("resumeTimeSeconds").that.equals(100);
        });
    });
});

const seriesWithId = (id: string) => ({
    id,

    discovery: "discovered",
    title: "title",
    type: MediaType.Series,

    seasons: [
        {
            id: `${id}:s1`,

            episodes: [
                episodeFor(id, 0),
                episodeFor(id, 1),
                episodeFor(id, 2),
            ],
        },
    ],
} as ISeries);

const episodeFor = (seriesId: string, index: number) => ({
    id: `episode-${index}`,
    seriesId,

    discovery: "discovered",
    title: `Episode ${index}`,
    type: MediaType.Episode,
});
