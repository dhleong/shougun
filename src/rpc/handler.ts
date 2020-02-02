import { borrow } from "../borrow/borrow";
import { loadLoans } from "../borrow/loader";
import { BorrowMode, IBorrowRequest } from "../borrow/model";
import { DefaultMatcher } from "../match/default";
import { IMedia } from "../model";
import { Shougun } from "../shougun";
import { IViewedInformation } from "../track/persistent";
import { generateMachineUuid } from "./id";
import { IRemoteConfig } from "./server";

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
        private readonly config: IRemoteConfig,
    ) {}

    public async getId() {
        return generateMachineUuid();
    }

    public async loadLoans() {
        if (this.config.borrowing !== BorrowMode.BORROWER) {
            throw new Error("Borrower requests are not enabled");
        }

        // refresh the local media in case some was downloaded
        // and we haven't detected the changes yet
        await this.shougun.refresh();

        await loadLoans(this.shougun);
    }

    public async markBorrowReturned(
        tokens: string[],
    ) {
        const { tracker } = this.shougun.context;
        return tracker.markBorrowReturned(
            tokens,
        );
    }

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

    public async retrieveBorrowed() {
        if (this.config.borrowing !== BorrowMode.BORROWER) {
            throw new Error("Borrower requests are not enabled");
        }

        const { tracker } = this.shougun.context;
        return tracker.retrieveBorrowed();
    }

    public async returnBorrowed(
        tokens: string[],
        viewedInformation: IViewedInformation[],
    ) {
        if (this.config.borrowing !== BorrowMode.LENDER) {
            throw new Error("Lender requests are not enabled");
        }

        const { tracker } = this.shougun.context;
        return tracker.returnBorrowed(
            tokens,
            viewedInformation,
        );
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

    public async startByPath(path: string) {
        const media = await this.shougun.findMediaByPath(path);
        if (!media) throw new Error(`No result for ${path}`);

        return this.shougun.play(media);
    }

    public async startByTitle(title: string) {
        const media = await this.shougun.findMedia(title);
        if (!media) throw new Error(`No result for ${title}`);

        return this.shougun.play(media);
    }

    public async borrow(
        requests: IBorrowRequest[],
    ) {
        if (this.config.borrowing !== BorrowMode.LENDER) {
            throw new Error("Lender requests are not enabled");
        }

        return borrow(this.shougun, requests);
    }

}
