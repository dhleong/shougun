import _debug from "debug";

import { IEpisodeQuery } from "babbling/dist/app";

import { borrow } from "../../borrow/borrow";
import { loadLoans } from "../../borrow/loader";
import { BorrowMode, IBorrowRequest } from "../../borrow/model";
import { IMedia, IMediaPrefs } from "../../model";
import { Shougun } from "../../shougun";
import { IViewedInformation } from "../../track/persistent";
import { generateMachineUuid } from "../id";
import type { IRemoteConfig } from "../server";
import { IPlaybackOptions } from "../../playback/player";
import { isLocalDiscoveryId } from "../../discover/local";
import { Connection } from "../msgpack";

const debug = _debug("shougun:rpc");

const MAX_RESULTS = 50; // don't try to send more than this over the wire

export interface IQueryOpts {
    maxResults: number;
}

export function formatMediaResults(shougun: Shougun, results: IMedia[]) {
    return Promise.all(
        results.map(async (media) => {
            if (isLocalDiscoveryId(media.discovery)) {
                debug("Preparing cover art for", media.id);
                try {
                    const playable = await shougun.getPlayable(media);
                    const cover = await playable?.getCoverUrl?.(
                        shougun.context,
                    );
                    if (cover != null) {
                        debug("Got cover:", cover);
                        return {
                            ...media,
                            cover,
                        };
                    }
                } catch (e) {
                    debug("Failed to load cover art for ", media.id, e);
                }
            }

            return media;
        }),
    );
}

export async function queryVia(
    shougun: Shougun,
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

    return formatMediaResults(shougun, selectedResults);
}

export class RpcMethodsV1 {
    public readonly VERSION = 1;

    constructor(
        connection: Connection,
        protected readonly shougun: Shougun,
        protected readonly config: IRemoteConfig,
    ) {}

    public async getId() {
        return generateMachineUuid();
    }

    public async borrow(requests: IBorrowRequest[]) {
        if (this.config.borrowing !== BorrowMode.LENDER) {
            throw new Error("Lender requests are not enabled");
        }

        return borrow(this.shougun, requests);
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

    public async markBorrowReturned(tokens: string[]) {
        const { tracker } = this.shougun.context;
        return tracker.markBorrowReturned(tokens);
    }

    public async queryRecent(
        options: {
            onlyLocal?: boolean;
        } & Partial<IQueryOpts>,
    ) {
        return queryVia(
            this.shougun,
            options,
            this.shougun.queryRecent(options),
        );
    }

    public async queryRecommended(
        options: {
            onlyLocal?: boolean;
        } & Partial<IQueryOpts>,
    ) {
        return queryVia(
            this.shougun,
            options,
            this.shougun.queryRecommended(options),
        );
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
        return tracker.returnBorrowed(tokens, viewedInformation);
    }

    public async search(query: string) {
        const media = await this.shougun.search(query);

        const sorted = this.shougun.context.matcher.sort(
            query,
            media,
            (item) => item.title,
        );

        // return a subset; results after this point are
        // usually garbage anyway
        return formatMediaResults(this.shougun, sorted.slice(0, 20));
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

        throw new Error(
            `No media with title ${media.title} and ID ${media.id}`,
        );
    }

    public async startByPath(path: string, options: IPlaybackOptions = {}) {
        const media = await this.shougun.findMediaByPath(path);
        if (!media) throw new Error(`No result for ${path}`);

        return this.shougun.play(media, options);
    }

    public async startByTitle(title: string, options: IPlaybackOptions = {}) {
        const media = await this.shougun.findMedia(title);
        if (!media) throw new Error(`No result for ${title}`);

        return this.shougun.play(media, options);
    }

    public async startEpisodeByTitle(
        title: string,
        query: IEpisodeQuery,
        options: IPlaybackOptions = {},
    ) {
        const media = await this.shougun.findMedia(title);
        if (!media) throw new Error(`No result for ${title}`);

        const episode = await this.shougun.findEpisodeFor(media, query);
        if (!episode)
            throw new Error(
                `Unable to resolve matching episode for ${media.title}`,
            );

        return this.shougun.play(episode, options);
    }

    public async deletePrefsForSeries(seriesId: string) {
        return this.shougun.prefs.deletePrefsForSeries(seriesId);
    }

    public async loadPrefsForSeries(seriesId: string) {
        return this.shougun.prefs.loadPrefsForSeries(seriesId);
    }

    public async updatePrefsForSeries(seriesId: string, prefs: IMediaPrefs) {
        return this.shougun.prefs.updatePrefsForSeries(seriesId, prefs);
    }
}
