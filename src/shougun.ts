import _debug from "debug";
const debug = _debug("shougun:core");

import {
    interleaveAsyncIterables,
    mergeAsyncIterables,
    toArray,
} from "babbling/dist/async";
import { Context } from "./context";
import { IDiscovery } from "./discover/base";
import { IMatcher } from "./match";
import {
    IMedia,
    IMediaResultsMap,
    IQueryable,
    isPlayable,
    isSeries,
    MediaType,
} from "./model";
import { IPlaybackOptions, IPlayer } from "./playback/player";
import { Server } from "./playback/serve";
import { ContextQueryable } from "./queryables/context";
import { ITracker } from "./track/base";

export interface IQueryOpts {
    onlyLocal?: boolean;
}

export class Shougun {
    public static async create(
        queryables: IQueryable[],
        discovery: IDiscovery,
        matcher: IMatcher,
        player: IPlayer,
        tracker: ITracker,
    ) {
        if (!queryables.length) {
            throw new Error("No queryables provided");
        }

        const context = new Context(
            queryables,
            discovery,
            matcher,
            player,
            tracker,
            new Server(),
            {},
        );

        await context.refreshKnownMedia();

        return new Shougun(context);
    }

    constructor(
        public readonly context: Context,
    ) {}

    /**
     * Reloads all media from all configured discoveries. Updates
     * [context.knownMedia] and returns that new `IMediaMap`
     */
    public async refresh() {
        return this.context.refreshKnownMedia();
    }

    public async search(query: string) {
        return toArray(mergeAsyncIterables(
            this.context.queryables.map(q =>
                q.findMedia(this.context, query),
            ),
        ));
    }

    public async getLocalPath(media: IMedia) {
        if (media.type === MediaType.ExternalPlayable) {
            return;
        }

        return this.context.discovery.getLocalPath(
            this.context,
            media,
        );
    }

    /**
     * Get a map whose keys are a discovery type and whose values
     * are AsyncIterables of recently watched media
     */
    public async getRecentsMap() {
        return this.getQueryableMap(q => q.queryRecent(this.context));
    }

    /**
     * Get a map whose keys are a discovery type and whose values
     * are AsyncIterables of recommended media
     */
    public async getRecommendationsMap() {
        return this.getQueryableMap(q => q.queryRecommended(this.context));
    }

    /**
     * Query "recently watched" titles, interleaving results from
     * each discovery type
     */
    public async *queryRecent(options: IQueryOpts = {}) {
        yield *this.queryFromMap(options, this.getRecentsMap());
    }

    /**
     * Query "recommended" titles to watch, interleaving results from
     * each discovery type
     */
    public async *queryRecommended(options: IQueryOpts = {}) {
        yield *this.queryFromMap(options, this.getRecommendationsMap());
    }

    /**
     * Find a Series or Movie by title
     */
    public async findMedia(query: string) {
        return this.withErrorsDisplayed(async () => {
            const titles = await this.search(query);

            return this.context.matcher.findBest(query, titles, (media: IMedia) =>
                media.title,
            );
        });
    }

    public async play(
        media: IMedia,
        options: IPlaybackOptions = {},
    ) {
        return this.withErrorsDisplayed(() =>
            this.playUnsafe(media, options),
        );
    }

    public async showRecommendations() {
        if (!this.context.player.showRecommendations) {
            const playerName = this.context.player.constructor.name;
            throw new Error(`Configured Player (${playerName}) does not support showing recommendations`);
        }

        return this.context.player.showRecommendations(
            this.context,
            toArray(this.queryRecommended()),
        );
    }

    private async playUnsafe(
        media: IMedia,
        options: IPlaybackOptions,
    ) {
        if (isPlayable(media)) {
            debug(`media is itself playable:`, media);
            await media.play(options);
            return media;
        }

        if (isSeries(media) || options.currentTime === undefined) {
            const track = await this.context.tracker.pickResumeForMedia(media);
            media = track.media;
            options.currentTime = track.resumeTimeSeconds;
            debug(`resuming ${media.title} with ${media.id} @${options.currentTime}`);
        }

        debug(`create playable for ${media.id}...`);
        const playable = await this.context.discovery.createPlayable(
            this.context,
            media,
        );

        debug(`playing ${media.id} as ${playable.id} with ${JSON.stringify(options)}...`);
        await this.context.player.play(this.context, playable, Object.assign({
            onPlayerPaused: async (pausedMedia: IMedia, currentTimeSeconds: number) => {
                debug(`record playerPaused of ${pausedMedia.id} @ ${currentTimeSeconds}`);
                return this.context.tracker.saveTrack(
                    pausedMedia,
                    currentTimeSeconds,
                    playable.durationSeconds,
                );
            },
        }, options));

        return media;
    }

    private async getQueryableMap(
        query: (queryable: IQueryable) => Promise<IMediaResultsMap>,
    ) {
        const allMaps = await Promise.all(this.context.queryables.map(query));

        let resultsBySource: IMediaResultsMap = {};
        for (const m of allMaps) {
            resultsBySource = { ...resultsBySource, ...m };
        }

        return resultsBySource;
    }

    private async *queryFromMap(
        options: IQueryOpts,
        map: Promise<IMediaResultsMap>,
    ) {
        if (options.onlyLocal === true) {
            const local = this.context.queryables.find(it => it instanceof ContextQueryable);
            if (!local) return;
            const recommended = await local.queryRecommended(this.context);
            yield *recommended.Shougun;
            return;
        }

        const resultsBySource = await this.getRecommendationsMap();
        yield *interleaveAsyncIterables(Object.values(resultsBySource));
    }

    private async withErrorsDisplayed<R>(
        block: () => Promise<R>,
    ): Promise<R> {
        try {
            return await block();
        } catch (e) {
            if (this.context.player.showError) {
                await this.context.player.showError(e);
            }
            throw e;
        }
    }
}
