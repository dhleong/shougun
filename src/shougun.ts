import _debug from "debug";
const debug = _debug("shougun:core");

import { IEpisodeQuery } from "babbling/dist/app";
import {
    interleaveAsyncIterables,
    mergeAsyncIterables,
    toArray,
} from "babbling/dist/async";

import { Context, IShougunOpts } from "./context";
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
import { ITracker, IPrefsTracker } from "./track/base";

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
        opts: IShougunOpts,
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
            opts,
            {},
        );

        await context.refreshKnownMedia();

        return new Shougun(context);
    }

    constructor(
        public readonly context: Context,
    ) {}

    public get prefs(): IPrefsTracker {
        return this.context.tracker;
    }

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
     * Given a SERIES or EXTERNAL-type Media object, attempt to locate
     * an `IMedia` instance representing a specific episode
     */
    public async findEpisodeFor(media: IMedia, query: IEpisodeQuery) {
        if (
            media.type === MediaType.Episode
                || media.type === MediaType.Movie
        ) {
            throw new Error(`Media type ${media.type} cannot have episodes`);
        }

        if (isPlayable(media)) {
            if (media.findEpisode) {
                const epFromMedia = await media.findEpisode(this.context, query);
                if (epFromMedia) {
                    epFromMedia.prefs = epFromMedia.prefs ?? media.prefs;
                }
                return epFromMedia;
            }

            // NOTE: if media is directly playable but doesn't support findEpisode,
            // we won't be able to find it through our discovery below, so don't try
            return;
        }

        const ep = await this.context.discovery.findEpisodeFor(
            this.context,
            media,
            query,
        );
        if (ep) {
            ep.prefs = ep.prefs ?? media.prefs;
        }
        return ep;
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

    public async findMediaByPath(path: string) {
        return this.withErrorsDisplayed(async () =>
            this.context.discovery.findByPath(
                this.context, path,
            ),
        );
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
        if (!media.prefs) {
            // try to fetch stored prefs
            const stored = await this.context.tracker.loadPrefsForSeries(media.id);
            if (stored) {
                media.prefs = stored;
            }
        }

        if (options.prefs) {
            media.prefs = {
                ...media.prefs,
                ...options.prefs,
            };
        }

        if (isPlayable(media)) {
            debug(`media is itself playable:`, media);
            await media.play(options);
            return media;
        }

        if (isSeries(media) || options.currentTime === undefined) {
            const track = await this.context.tracker.pickResumeForMedia(media);
            track.media.prefs = {
                ...media.prefs,
                ...track.media.prefs,
                ...options.prefs,  // provided prefs still override
            }
            media = track.media;
            options.currentTime = track.resumeTimeSeconds;
            debug(`resuming ${media.title} (#${media.id}) @${options.currentTime} with`, media.prefs);
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
        } catch (e: any) {
            if (this.context.player.showError) {
                await this.context.player.showError(e);
            }
            throw e;
        }
    }
}
