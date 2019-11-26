import { DefaultMatcher } from "../match/default";
import { IMedia } from "../model";
import { Shougun } from "../shougun";
import { TakeoutManager } from "../takeout/manager";
import { ITakeoutRequest } from "../takeout/model";
import { IViewedInformation } from "../track/persistent";

const MAX_RESULTS = 50; // don't try to send more than this over the wire

interface IQueryOpts {
    maxResults: number;
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

    public async takeout(
        requests: ITakeoutRequest[],
    ) {
        return new TakeoutManager(this.shougun)
            .takeout(requests);
    }

    public async returnTakeout(
        token: string,
        viewedInformation: IViewedInformation[],
    ) {
        return new TakeoutManager(this.shougun)
            .returnTakeout(token, viewedInformation);
    }
}
