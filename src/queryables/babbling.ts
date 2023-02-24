import _debug from "debug";

import { ChromecastDevice, PlayerBuilder } from "babbling";
import {
    IPlayableOptions,
    IQueryResult,
    RecommendationType,
} from "babbling/dist/app";

import { Context } from "../context";
import {
    IMedia,
    IMediaResultsMap,
    IPlayableMedia,
    IQueryable,
    MediaType,
} from "../model";
import { IPlaybackOptions } from "../playback/player";

const debug = _debug("shougun:queryable:babbling");

const DISCOVERY_PREFIX = "babbling:";

type PromiseType<T> = T extends Promise<infer P> ? P : never;
type Player = PromiseType<ReturnType<BabblingQueryable["getPlayer"]>>;

function queryErrorHandler(app: string, error: unknown) {
    debug("error querying", app, error);
}

function packQueryOpts(onError?: (app: string, error: Error) => void) {
    return { onError: onError ?? queryErrorHandler };
}

function shougunOptsToBabblingOpts(
    _opts: IPlaybackOptions,
): IPlayableOptions | undefined {
    // NOTE: There's probably not actually anything we can do here...
    return undefined;
}

function resultToMedia(
    player: Player,
    result: IQueryResult,
): IPlayableMedia & { cover?: string } {
    return {
        cover: (result as any).cover,
        discovery: `${DISCOVERY_PREFIX}${result.appName}`,
        id: result.url || `${result.appName}:${result.title}`,
        title: result.title,
        type: MediaType.ExternalPlayable,

        async play(opts) {
            await player.play(result, shougunOptsToBabblingOpts(opts));
        },

        async findEpisode(context, query) {
            const episode = await player.findEpisodeFor(result, query);
            if (episode) {
                return resultToMedia(player, episode);
            }
        },
    };
}

async function* transformQueryResultsToPlayableMedia(
    player: Player,
    results: AsyncIterable<IQueryResult>,
) {
    for await (const result of results) {
        yield resultToMedia(player, result);
    }
}

export class BabblingQueryable implements IQueryable {
    constructor(
        public readonly configPath?: string,
        private readonly chromecastDeviceName?: string,
    ) {}

    public async inflateQueriedMedia(media: IMedia) {
        const playable: IPlayableMedia = {
            ...media,

            play: async (opts) => {
                const player = await this.getPlayer();
                await player.playUrl(media.id, shougunOptsToBabblingOpts(opts));
            },

            findEpisode: async (context, query) => {
                const player = await this.getPlayer();
                const episode = await player.findEpisodeFor(
                    {
                        appName: media.discovery.substring(
                            DISCOVERY_PREFIX.length,
                        ),
                        title: media.title,
                    },
                    query,
                );
                if (episode) {
                    return resultToMedia(player, episode);
                }
            },
        };
        return playable;
    }

    public isProviderFor(media: IMedia): boolean {
        return (
            media.type === MediaType.ExternalPlayable &&
            media.discovery.startsWith(DISCOVERY_PREFIX)
        );
    }

    public async *findMedia(
        context: Context,
        query: string,
        onError?: (app: string, error: Error) => void,
    ): AsyncIterable<IMedia> {
        const player = await this.getPlayer();
        const iterable = player.queryByTitle(
            query,
            onError ?? queryErrorHandler,
        );

        yield* transformQueryResultsToPlayableMedia(player, iterable);
    }

    public async queryRecent(
        _context: Context,
        onError?: (app: string, error: Error) => void,
    ): Promise<IMediaResultsMap> {
        // NOTE: babbling doesn't technically support recents yet, but actually
        // all the implementations return that, so just do it for now
        return this.getMediaMapBy((p) =>
            p.getRecentsMap(packQueryOpts(onError)),
        );
    }

    public async queryRecommended(
        _context: Context,
        onError?: (app: string, error: Error) => void,
    ): Promise<IMediaResultsMap> {
        return this.getMediaMapBy((p) =>
            p.getQueryRecommendationsMap(
                {
                    excludeTypes: [RecommendationType.Recent],
                },
                packQueryOpts(onError),
            ),
        );
    }

    private async getMediaMapBy(
        predicate: (player: Player) => {
            [key: string]: AsyncIterable<IQueryResult>;
        },
    ) {
        const player = await this.getPlayer();
        const map = predicate(player);
        return Object.keys(map).reduce((m, k) => {
            /* eslint-disable no-param-reassign */
            const results = map[k];
            m[k] = transformQueryResultsToPlayableMedia(player, results);
            /* eslint-enable no-param-reassign */
            return m;
        }, {} as IMediaResultsMap);
    }

    private async getPlayer() {
        const builder = await PlayerBuilder.autoInflate(this.configPath);

        if (this.chromecastDeviceName) {
            builder.addDevice(new ChromecastDevice(this.chromecastDeviceName));
        }

        return builder.build();
    }
}
