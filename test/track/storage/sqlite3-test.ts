import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import chaiSubset from "chai-subset";
import { MediaType } from "../../../src/model";

import { ILoanCreate } from "../../../src/track/base";
import { IViewedInformation } from "../../../src/track/persistent";
import { Sqlite3Storage } from "../../../src/track/storage/sqlite3";
import { toArray } from "../../discover/util";

chai.use(chaiAsPromised);
chai.use(chaiSubset);
chai.should();

const { expect } = chai;

const seriesId = "firefly";

function episodeWith(extra: Partial<IViewedInformation> = {}) {
    return {
        id: "id",
        seriesId,
        title: "Mighty fine Shindig",
        mediaType: MediaType.Episode,

        lastViewedTimestamp: 9001,
        resumeTimeSeconds: 0,
        videoDurationSeconds: 0,

        ...extra,
    };
}

async function expectArray<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const result = await toArray(iterable);
    if (result == null) {
        throw new Error(`Expected array but was ${result}`);
    }
    return result;
}

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
            mediaType: MediaType.Series,

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
            mediaType: MediaType.Series,

            lastViewedTimestamp: 0,
            resumeTimeSeconds: 0,
            videoDurationSeconds: 0,
        };

        storage.save(original);

        const updated = { ...original, resumeTimeSeconds: 42 };
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

        const result = await expectArray(storage.queryRecent());
        result[0].should.deep.equal(latest);
    });

    it("retrieveBorrowed fetches watches after", async () => {
        const beforeBorrow = episodeWith({
            id: "before-borrow",
            lastViewedTimestamp: 0,
        });

        storage.save(beforeBorrow);
        storage.createLoan({
            createdTimestamp: 200,
            serverId: "serenity",
            token: "firefly",
        } as ILoanCreate);

        const afterBorrow = episodeWith({
            id: "after-borrow",
            lastViewedTimestamp: 500,
            seriesId: "good-place",
        });
        storage.save(afterBorrow);

        const borrowedData = await storage.retrieveBorrowed();
        borrowedData.should.containSubset({
            tokens: [
                {
                    serverId: "serenity",
                    token: "firefly",
                },
            ],
            viewedInformation: [
                {
                    id: "after-borrow",
                    lastViewedTimestamp: 500,
                    seriesId: "good-place",
                },
            ],
        });
    });

    it("returnBorrowed works", async () => {
        await storage.createLoan({
            createdTimestamp: 200,
            serverId: "serenity",
            token: "firefly",
        } as ILoanCreate);

        await storage.returnBorrowed(
            ["firefly"],
            [
                {
                    id: "after-borrow",
                    seriesId: "good-place",
                    title: "After Borrow",
                    mediaType: MediaType.Episode,

                    lastViewedTimestamp: 500,
                    resumeTimeSeconds: 0,
                    videoDurationSeconds: 500,
                },
            ],
        );

        const data = await storage.retrieveBorrowed();
        data.tokens.should.be.empty;
        data.viewedInformation.should.be.empty;

        const info = await storage.loadLastViewedForSeries("good-place");
        if (!info) throw new Error("Should have viewedInfo");

        info.should.containSubset({
            id: "after-borrow",
            seriesId: "good-place",
        });
    });

    it("returnBorrowed rolls back when invalid tokens provided", async () => {
        await storage.createLoan({
            createdTimestamp: 200,
            serverId: "serenity",
            token: "firefly",
        } as ILoanCreate);

        await (async () => {
            return storage.returnBorrowed(
                ["firefly", "alliance"],
                [
                    {
                        id: "after-borrow",
                        seriesId: "good-place",
                        title: "After Borrow",
                        mediaType: MediaType.Episode,

                        lastViewedTimestamp: 500,
                        resumeTimeSeconds: 0,
                        videoDurationSeconds: 500,
                    },
                ],
            );
        })().should.be.rejectedWith(/Invalid tokens/);

        const data = await storage.retrieveBorrowed();
        data.tokens.should.deep.equal([
            {
                serverId: "serenity",
                token: "firefly",
            },
        ]);
        data.viewedInformation.should.be.empty;

        const info = await storage.loadLastViewedForSeries("good-place");
        expect(info).to.be.null;
    });

    it("returnBorrowed with empty arrays is a nop", async () => {
        await storage.createLoan({
            createdTimestamp: 200,
            serverId: "serenity",
            token: "firefly",
        } as ILoanCreate);

        await storage.returnBorrowed([], []);

        const data = await storage.retrieveBorrowed();
        data.tokens.should.deep.equal([
            {
                serverId: "serenity",
                token: "firefly",
            },
        ]);
        data.viewedInformation.should.be.empty;
    });

    describe("SeriesPrefs", () => {
        it("update with a partial is non-destructive", async () => {
            await storage.updatePrefsForSeries("firefly", {
                preferredAudioLanguage: "jp",
                someOtherValue: "serenity",
            } as any);

            await storage.updatePrefsForSeries("firefly", {
                preferredAudioLanguage: "en",
            } as any);

            const loaded = await storage.loadPrefsForSeries("firefly");
            expect(loaded).to.deep.equal({
                preferredAudioLanguage: "en",
                someOtherValue: "serenity",
            });
        });
    });

    describe("queryRecent", () => {
        it("handles null mediaType", async () => {
            const latest = episodeWith({
                id: "first",
                lastViewedTimestamp: 9001,
            });
            (latest as any).mediaType = undefined;
            storage.save(latest);

            const result = await expectArray(storage.queryRecent());
            result.should.have.lengthOf(1);
        });

        it("handles excluding external", async () => {
            const external = episodeWith({
                id: "first",
                seriesId: undefined,
                lastViewedTimestamp: 9001,
            });
            external.mediaType = MediaType.ExternalPlayable;
            storage.save(external);

            const result = await expectArray(storage.queryRecent());
            result.should.be.empty;
        });

        it("handles only external", async () => {
            storage.save(
                episodeWith({
                    id: "0",
                    lastViewedTimestamp: 9001,
                }),
            );

            const external = episodeWith({
                id: "external",
                seriesId: undefined,
                lastViewedTimestamp: 9001,
            });
            external.mediaType = MediaType.ExternalPlayable;
            storage.save(external);

            const result = await expectArray(
                storage.queryRecent({ external: "only" }),
            );
            result.should.have.lengthOf(1);
            result[0].id.should.equal("external");
        });

        it("handles including external", async () => {
            storage.save(
                episodeWith({
                    id: "episode",
                    lastViewedTimestamp: 9001,
                }),
            );

            const external = episodeWith({
                id: "external",
                seriesId: undefined,
                lastViewedTimestamp: 9001,
            });
            external.mediaType = MediaType.ExternalPlayable;
            storage.save(external);

            const result = await expectArray(
                storage.queryRecent({ external: "include" }),
            );
            result.should.have.lengthOf(2);
        });
    });
});
