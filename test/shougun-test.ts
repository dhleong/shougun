import * as chai from "chai";
import { Context } from "../src/context";
import { IDiscovery } from "../src/discover/base";
import { IMatcher } from "../src/match";
import {
    IMedia,
    IMediaPrefs,
    IMediaResultsMap,
    IQueryable,
    MediaType,
    ProviderErrorHandler,
} from "../src/model";
import { IPlayer } from "../src/playback/player";
import { IServer } from "../src/playback/serve";
import { Shougun } from "../src/shougun";
import { ILoanData, IRecentMedia, ITrack, ITracker } from "../src/track/base";
import { toArray } from "./discover/util";

chai.should();

const OWL_HOUSE: IMedia = {
    id: "owl-house",
    title: "Owl House",
    type: MediaType.ExternalPlayable,
    discovery: "",
};

const SPOP: IMedia = {
    id: "spop",
    title: "SPOP",
    type: MediaType.ExternalPlayable,
    discovery: "",
};

const FIREFLY: IMedia = {
    id: "firefly",
    title: "Firefly",
    type: MediaType.ExternalPlayable,
    discovery: "",
};

class FakeQueryable implements IQueryable {
    public recent: IMedia[] = [];

    public isProviderFor(_media: IMedia): boolean {
        return true;
    }
    public async queryRecent(
        _context: Context,
        _onError?: ProviderErrorHandler,
    ): Promise<IMediaResultsMap> {
        const { recent } = this;
        return {
            Fake: (async function* fake() {
                yield* recent;
            })(),
        };
    }
    public queryRecommended(
        context: Context,
        onError?: ProviderErrorHandler,
    ): Promise<IMediaResultsMap> {
        return this.queryRecent(context, onError);
    }
    public async *findMedia(
        _context: Context,
        _query: string,
        _onError?: ProviderErrorHandler,
    ): AsyncIterable<IMedia> {
        // nop
    }
}

class FakeTracker implements ITracker {
    public recents: IRecentMedia[] = [];

    public pickResumeForMedia(): Promise<ITrack> {
        throw new Error("Method not implemented.");
    }
    public saveTrack(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    public async *queryRecent(): AsyncIterable<IRecentMedia> {
        yield* this.recents;
    }
    public createLoan(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    public markBorrowReturned(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    public retrieveBorrowed(): Promise<ILoanData> {
        throw new Error("Method not implemented.");
    }
    public returnBorrowed(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    public deletePrefsForSeries(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    public loadPrefsForSeries(): Promise<IMediaPrefs | null> {
        throw new Error("Method not implemented.");
    }
    public updatePrefsForSeries(): Promise<IMediaPrefs> {
        throw new Error("Method not implemented.");
    }
}

describe("Shougun", () => {
    let shougun: Shougun;
    let queryable: FakeQueryable;
    let tracker: FakeTracker;

    beforeEach(() => {
        queryable = new FakeQueryable();
        tracker = new FakeTracker();
        shougun = new Shougun(
            new Context(
                [queryable],
                {} as IDiscovery,
                {} as IMatcher,
                {} as IPlayer,
                tracker,
                {} as IServer,
                {},
                {},
            ),
        );
    });

    describe("queryRecent", () => {
        it("sorts watched external media higher than unwatched", async () => {
            queryable.recent = [OWL_HOUSE, SPOP, FIREFLY];

            tracker.recents = [{ ...SPOP, lastViewedTimestamp: 42 }];

            const recent = await toArray(shougun.queryRecent());
            recent.should.have.length(3);
            recent[0].id.should.equal("spop");
        });

        it("sorts both-watched external media based on timestamps", async () => {
            queryable.recent = [FIREFLY, SPOP, OWL_HOUSE];

            tracker.recents = [
                { ...SPOP, lastViewedTimestamp: 42 },
                { ...OWL_HOUSE, lastViewedTimestamp: 9001 },
                { ...FIREFLY, lastViewedTimestamp: 50 },
            ];

            const recent = await toArray(shougun.queryRecent());
            recent.should.have.length(3);
            recent[0].id.should.equal("owl-house");
            recent[1].id.should.equal("firefly");
            recent[2].id.should.equal("spop");
        });
    });
});
