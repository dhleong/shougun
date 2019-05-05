import * as chai from "chai";
import chaiSubset from "chai-subset";
import { instance, mock, when } from "ts-mockito";

import { Context } from "../../src/context";
import { BasePlayable } from "../../src/media/playable-base";
import { IEpisode, ISeries, MediaType } from "../../src/model";
import { IPlaybackOptions } from "../../src/playback/player";
import { fakeEpisode } from "../utils";

chai.use(chaiSubset);
chai.should();

class TestPlayable extends BasePlayable {

    public id: string;
    public contentType = "video/mp4";
    public durationSeconds = 42;
    public media: IEpisode;

    constructor(
        id: string,
    ) {
        super();
        this.id = id;
        this.media = {
            discovery: "test",
            id,
            seriesId: "series",
            title: id,
            type: MediaType.Episode,
        };
    }

    public getUrl(
        context: Context,
        opts?: IPlaybackOptions | undefined,
    ): Promise<string> {
        throw new Error("Method not implemented.");
    }

}

describe("BasePlayable", () => {
    describe("queue loading", () => {

        const series: ISeries = {
            discovery: "test",
            id: "series",
            title: "Firefly",
            type: MediaType.Series,

            seasons: [
                {
                    episodes: [ ],
                    id: "1",
                },
            ],
        };

        let contextMock: Context;
        let context: Context;
        let playable: TestPlayable;

        beforeEach(() => {
            contextMock = mock(Context);
            context = instance(contextMock);

            when(contextMock.getSeries("series")).thenResolve(series);
        });

        it("works for the first episode", async () => {
            playable = new TestPlayable("0");

            series.seasons[0].episodes = [
                fakeEpisode("0"),
                fakeEpisode("1"),
            ];

            const q = await playable.loadQueueAround(context);
            q.should.containSubset([
                { id: "0" },
                { id: "1" },
            ]);
        });

        it("works for a middle episode", async () => {
            playable = new TestPlayable("1");

            series.seasons[0].episodes = [
                fakeEpisode("0"),
                fakeEpisode("1"),
                fakeEpisode("2"),
            ];

            const q = await playable.loadQueueAround(context);
            q.should.containSubset([
                { id: "0" },
                { id: "1" },
                { id: "2" },
            ]);
        });

        it("works across seasons", async () => {
            playable = new TestPlayable("2");

            series.seasons[0].episodes = [
                fakeEpisode("0"),
                fakeEpisode("1"),
                fakeEpisode("2"),
            ];

            series.seasons[1] = { id: "1", episodes: [] };
            series.seasons[1].episodes = [
                fakeEpisode("3"),
                fakeEpisode("4"),
                fakeEpisode("5"),
            ];

            const q = await playable.loadQueueAround(context);
            q.should.containSubset([
                { id: "0" },
                { id: "1" },
                { id: "2" },
                { id: "3" },
                { id: "4" },
                { id: "5" },
            ]);
        });

        it("works for the last episode", async () => {
            playable = new TestPlayable("2");

            series.seasons[0].episodes = [
                fakeEpisode("0"),
                fakeEpisode("1"),
                fakeEpisode("2"),
            ];

            const q = await playable.loadQueueAround(context);
            q.should.containSubset([
                { id: "0" },
                { id: "1" },
                { id: "2" },
            ]);
        });
    });
});
