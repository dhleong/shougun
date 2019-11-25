import { DefaultMatcher } from "../match/default";
import { IMedia, ISeries, isSeries } from "../model";
import { DummyPlayer } from "../playback/player/dummy";
import { Shougun } from "../shougun";
import { ITrack } from "../track/base";
import { IViewedInformation } from "../track/persistent";

const MAX_RESULTS = 50; // don't try to send more than this over the wire

interface IQueryOpts {
    maxResults: number;
}

interface ITakeoutRequest {
    episodes: number;
    seriesId: string;
}

async function queryVia(
    options: Partial<IQueryOpts>,
    iterableResults: AsyncIterable<IMedia>,
) {
    const selectedResults = [];

    const opts = {
        maxResults: 20,

        ...options,
    };

    let limit = Math.min(opts.maxResults, MAX_RESULTS);
    for await (const r of iterableResults) {
        selectedResults.push(r);

        if (--limit <= 0) {
            break;
        }
    }

    return selectedResults;
}

export class RpcHandler {
    public readonly VERSION = 1;

    constructor(
        private readonly shougun: Shougun,
    ) {}

    public async queryRecent(options: {
        onlyLocal?: boolean,
    } & Partial<IQueryOpts>) {
        return queryVia(options, this.shougun.queryRecent(options));
    }

    public async queryRecommended(options: {
        onlyLocal?: boolean,
    } & Partial<IQueryOpts>) {
        return queryVia(options, this.shougun.queryRecommended(options));
    }

    public async search(query: string) {
        const media = await this.shougun.search(query);

        const matcher = new DefaultMatcher();
        const sorted = matcher.sort(
            query,
            media,
            item => item.title,
        );

        // return a subset; results after this point are
        // usually garbage anyway
        return sorted.slice(0, 20);
    }

    public async showRecommendations() {
        return this.shougun.showRecommendations();
    }

    public async start(media: IMedia) {
        const candidates = await this.shougun.search(media.title);
        if (!candidates) throw new Error(`No results for ${media.title}`);

        for (const c of candidates) {
            if (c.discovery === media.discovery && c.id === media.id) {
                return this.shougun.play(c);
            }
        }

        throw new Error(`No media with title ${media.title} and ID ${media.id}`);
    }

    public async startByTitle(title: string) {
        const media = await this.shougun.findMedia(title);
        if (!media) throw new Error(`No result for ${title}`);

        return this.shougun.play(media);
    }

    /**
     * Request URLs and other data to capture a snapshot of local
     * media for playback on the local machine. This is sort of a
     * poor man's sync
     */
    public async takeout(
        requests: ITakeoutRequest[],
    ) {
        const { context } = this.shougun;
        const responses = await Promise.all(requests.map(async req => {
            const media = await context.getMediaById(req.seriesId);
            if (!media) return;

            const resume = await context.tracker.pickResumeForMedia(media);
            const episodes = [resume];
            if (isSeries(media)) {
                addNextEpisodes(episodes, media, resume, req.episodes - 1);
            }

            // create a dummy Context so we receive the original
            // media without any transcoding
            const dummyContext = context.withPlayer(new DummyPlayer());
            return Promise.all(episodes.map(async e => {
                const p = await context.discovery.createPlayable(context, e.media);
                return {
                    ...e,
                    url: await p.getUrl(dummyContext),
                };
            }));
        }));

        // TODO create a takeout token
        return {
            media: responses,
        };
    }

    /**
     * Save viewed information encountered during a takeout request.
     */
    public async returnTakeout(
        token: string,
        viewedInformation: IViewedInformation[],
    ) {
        // TODO
    }
}

function addNextEpisodes(
    episodes: ITrack[],
    media: ISeries,
    resume: ITrack,
    requested: number,
) {
    let remainingCount = requested;
    let foundResume = false;
    for (const s of media.seasons) {
        for (const e of s.episodes) {
            if (foundResume && remainingCount-- > 0) {
                episodes.push({ media: e });
            } else if (!foundResume && e.id === resume.media.id) {
                foundResume = true;
            }

            if (remainingCount <= 0) break;
        }

        if (remainingCount <= 0) break;
    }
}
