import _debug from "debug";

import { ChromecastDevice, PlayerBuilder } from "babbling";
import { IQueryResult } from "babbling/dist/app";

import { AppSpecificErrorHandler } from "babbling/dist/player";
import { Context } from "../context";
import {
    IMedia,
    IMediaResultsMap,
    IPlayableMedia,
    IQueryable,
    MediaType,
} from "../model";

const debug = _debug("shougun:queryable:babbling");

type PromiseType<T> = T extends Promise<infer P> ? P : never;
type Player = PromiseType<ReturnType<BabblingQueryable["getPlayer"]>>;

function queryErrorHandler(app: string, error: unknown) {
    debug("error querying", app, error);
}

function resultToMedia(
    player: Player,
    result: IQueryResult,
): IPlayableMedia & { cover?: string } {
    return {
        cover: (result as any).cover,
        discovery: `babbling:${result.appName}`,
        id: result.url || `${result.appName}:${result.title}`,
        title: result.title,
        type: MediaType.ExternalPlayable,

        async play(_opts) {
            // TODO: Can we interop the opts?
            await player.play(result);
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
        private readonly configPath?: string,
        private readonly chromecastDeviceName?: string,
    ) {}

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

    public async queryRecent(_context: Context): Promise<IMediaResultsMap> {
        // NOTE: babbling doesn't technically support recents yet, but actually
        // all the implementations return that, so just do it for now
        // TODO: whenever babbling adds getRecentsMap, use that
        return this.getMediaMapBy((p, onError) =>
            p.getRecommendationsMap(onError),
        );
    }

    public async queryRecommended(
        _context: Context,
    ): Promise<IMediaResultsMap> {
        return this.getMediaMapBy((p, onError) =>
            p.getRecommendationsMap(onError),
        );
    }

    private async getMediaMapBy(
        predicate: (
            player: Player,
            onError: AppSpecificErrorHandler,
        ) => { [key: string]: AsyncIterable<IQueryResult> },
    ) {
        const player = await this.getPlayer();
        const results: IMediaResultsMap = {};
        const map = predicate(player, (app, error) => {
            results[app] = error;
        });
        return Object.keys(map).reduce((m, k) => {
            /* eslint-disable no-param-reassign */
            const results = map[k];
            m[k] = transformQueryResultsToPlayableMedia(player, results);
            /* eslint-enable no-param-reassign */
            return m;
        }, results);
    }

    private async getPlayer() {
        const builder = await PlayerBuilder.autoInflate(this.configPath);

        if (this.chromecastDeviceName) {
            builder.addDevice(new ChromecastDevice(this.chromecastDeviceName));
        }

        return builder.build();
    }
}
