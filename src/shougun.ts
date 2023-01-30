import _debug from "debug";

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
    ProviderErrorHandler,
} from "./model";
import { IPlaybackOptions, IPlayer } from "./playback/player";
import { Server } from "./playback/serve";
import { ContextQueryable } from "./queryables/context";
import { ITracker, IPrefsTracker } from "./track/base";
import { assocByAsync } from "./util/collection";
import { createCompareByRecencyData } from "./media/sorting";

const debug = _debug("shougun:core");

export interface IQueryOpts {
    onlyLocal?: boolean;

    /**
     * If provided, will be called at most once per connected Provider with an
     * Error describing why that provider could not service the query. If not
     * provided, any such errors will simply be logged
     */
    onProviderError?: (provider: string, error: Error) => void;
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

    constructor(public readonly context: Context) {}

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

    public async search(query: string, options?: IQueryOpts) {
        // TODO: onlyLocal?
        return toArray(
            mergeAsyncIterables(
                this.context.queryables.map((q) =>
                    q.findMedia(this.context, query, options?.onProviderError),
                ),
            ),
        );
    }

    public async getLocalPath(media: IMedia) {
        if (media.type === MediaType.ExternalPlayable) {
            return;
        }

        return this.context.discovery.getLocalPath(this.context, media);
    }

    public async getPlayable(media: IMedia) {
        const { playable } = await this.resolvePlayableMedia(media, {});
        return playable;
    }

    /**
     *
     */
    public async inflateQueriedMedia(media: IMedia) {
        const source = this.queryableFor(media);
        return source.inflateQueriedMedia?.(media) ?? media;
    }

    /**
     * Get a map whose keys are a discovery type and whose values
     * are AsyncIterables of recently watched media
     */
    public async getRecentsMap(onProviderError?: ProviderErrorHandler) {
        return this.getQueryableMap((q) =>
            q.queryRecent(this.context, onProviderError),
        );
    }

    /**
     * Get a map whose keys are a discovery type and whose values
     * are AsyncIterables of recommended media
     */
    public async getRecommendationsMap(onProviderError?: ProviderErrorHandler) {
        return this.getQueryableMap((q) =>
            q.queryRecommended(this.context, onProviderError),
        );
    }

    /**
     * Query "recently watched" titles, interleaving results from
     * each discovery type
     */
    public async *queryRecent(options: IQueryOpts = {}) {
        const iterableRecents = this.queryFromMap(
            options,
            this.getRecentsMap(options.onProviderError),
        );
        if (options.onlyLocal === true) {
            // In this simple case, we know that results will already be sorted
            // by recency, so we can properly maintain the async iterator by returning
            // it directly.
            return iterableRecents;
        }

        // In order to provide a more intuitive view of "recent" media across providers
        // (most of which do *not* provide last-viewed timestamps for us!) we fetch our
        // locally-tracked timestamps for recent series and sort the iterable based on that.
        // This does mean we're not really providing a "true" AsyncIterable but that's
        // probably okay...
        const [media, tracksById] = await Promise.all([
            toArray(iterableRecents),

            assocByAsync(
                this.context.tracker.queryRecent({
                    limit: 100,
                    external: "only",
                }),
                (track) => track.seriesId ?? track.id,
            ),
        ]);

        const comparator = createCompareByRecencyData(tracksById);
        media.sort(comparator);

        yield* media;
    }

    /**
     * Query "recommended" titles to watch, interleaving results from
     * each discovery type
     */
    public async *queryRecommended(options: IQueryOpts = {}) {
        yield* this.queryFromMap(
            options,
            this.getRecommendationsMap(options.onProviderError),
        );
    }

    /**
     * Given a SERIES or EXTERNAL-type Media object, attempt to locate
     * an `IMedia` instance representing a specific episode
     */
    public async findEpisodeFor(media: IMedia, query: IEpisodeQuery) {
        if (
            media.type === MediaType.Episode ||
            media.type === MediaType.Movie
        ) {
            throw new Error(`Media type ${media.type} cannot have episodes`);
        }

        if (isPlayable(media)) {
            if (media.findEpisode) {
                const epFromMedia = await media.findEpisode(
                    this.context,
                    query,
                );
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
    public async findMedia(query: string, options?: IQueryOpts) {
        return this.withErrorsDisplayed(async () => {
            const titles = await this.search(query, options);

            return this.context.matcher.findBest(
                query,
                titles,
                (media: IMedia) => media.title,
            );
        });
    }

    public async findMediaByPath(path: string) {
        return this.withErrorsDisplayed(async () =>
            this.context.discovery.findByPath(this.context, path),
        );
    }

    public async play(media: IMedia, options: IPlaybackOptions = {}) {
        return this.withErrorsDisplayed(() => this.playUnsafe(media, options));
    }

    public async showRecommendations() {
        if (!this.context.player.showRecommendations) {
            const playerName = this.context.player.constructor.name;
            throw new Error(
                `Configured Player (${playerName}) does not support showing recommendations`,
            );
        }

        return this.context.player.showRecommendations(
            this.context,
            toArray(this.queryRecommended()),
        );
    }

    private async playUnsafe(media: IMedia, options: IPlaybackOptions) {
        const { media: resolvedMedia, playable } =
            await this.resolvePlayableMedia(media, options);

        if (playable == null) {
            // media itself must be a PlayableMedia
            await resolvedMedia.play(options);
            await this.context.tracker.saveTrack(media, 0, 0);
            return resolvedMedia;
        }

        debug(
            `playing ${media.id} as ${playable.id} with ${JSON.stringify(
                options,
            )}...`,
        );
        await this.context.player.play(this.context, playable, {
            onPlayerPaused: async (
                pausedMedia: IMedia,
                currentTimeSeconds: number,
                durationSeconds: number | undefined,
            ) => {
                debug(
                    `record playerPaused of ${pausedMedia.id} @ ${currentTimeSeconds} / ${durationSeconds}`,
                );
                return this.context.tracker.saveTrack(
                    pausedMedia,
                    currentTimeSeconds,
                    durationSeconds ?? playable.durationSeconds,
                );
            },
            ...options,
        });

        return media;
    }

    private async resolvePlayableMedia(
        media: IMedia,
        options: IPlaybackOptions,
    ) {
        if (!media.prefs) {
            // try to fetch stored prefs
            const stored = await this.context.tracker.loadPrefsForSeries(
                media.id,
            );
            if (stored) {
                // eslint-disable-next-line no-param-reassign
                media.prefs = stored;
            }
        }

        if (options.prefs) {
            // eslint-disable-next-line no-param-reassign
            media.prefs = {
                ...media.prefs,
                ...options.prefs,
            };
        }

        if (isPlayable(media)) {
            debug("media is itself playable:", media);
            return { media, playable: null };
        }

        if (isSeries(media) || options.currentTime === undefined) {
            const track = await this.context.tracker.pickResumeForMedia(media);
            track.media.prefs = {
                ...media.prefs,
                ...track.media.prefs,
                ...options.prefs, // provided prefs still override
            };
            track.media = {
                // Ensure any discovery-specific extra props are carried over
                // (eg: series cover data, if the media itself does not have cover data)
                ...media,
                ...track.media,
            };
            // eslint-disable-next-line no-param-reassign
            media = track.media;
            // eslint-disable-next-line no-param-reassign
            options.currentTime = track.resumeTimeSeconds;
            debug(
                `create resume for ${media.title} (#${media.id}) @${options.currentTime} with`,
                media.prefs,
            );
        }

        debug(`create playable for ${media.id}...`);
        const playable = await this.context.discovery.createPlayable(
            this.context,
            media,
        );

        return { media, playable };
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

    private queryableFor(media: IMedia) {
        for (const queryable of this.context.queryables) {
            if (queryable.isProviderFor(media)) {
                return queryable;
            }
        }
        throw new Error(
            `No registered Queryable claimed ownership of ${JSON.stringify(
                media,
            )}`,
        );
    }

    private async *queryFromMap(
        options: IQueryOpts,
        map: Promise<IMediaResultsMap>,
    ) {
        if (options.onlyLocal === true) {
            const local = this.context.queryables.find(
                (it) => it instanceof ContextQueryable,
            );
            if (!local) return;
            const recommended = await map;
            yield* recommended.Shougun;
            return;
        }

        const resultsBySource = await map;
        yield* interleaveAsyncIterables(Object.values(resultsBySource));
    }

    private async withErrorsDisplayed<R>(block: () => Promise<R>): Promise<R> {
        try {
            return await block();
        } catch (e: any) {
            debug("captured error: ", e);
            if (this.context.player.showError) {
                debug("showing captured error", e);
                try {
                    await this.context.player.showError(e);
                } catch (innerError) {
                    debug(
                        "encountered error trying to display error:",
                        innerError,
                    );
                }
            }
            throw e;
        }
    }
}
