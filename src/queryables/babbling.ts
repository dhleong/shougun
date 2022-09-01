import _debug from "debug";

import { ChromecastDevice, PlayerBuilder } from "babbling";
import { IQueryResult } from "babbling/dist/app";

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

export class BabblingQueryable implements IQueryable {
    constructor(
        private readonly configPath?: string,
        private readonly chromecastDeviceName?: string,
    ) {}

    public async *findMedia(
        context: Context,
        query: string,
    ): AsyncIterable<IMedia> {
        const player = await this.getPlayer();
        const iterable = player.queryByTitle(query, queryErrorHandler);

        yield* transformQueryResultsToPlayableMedia(player, iterable);
    }

    public async queryRecent(context: Context): Promise<IMediaResultsMap> {
        // NOTE: babbling doesn't technically support recents yet, but actually
        // all the implementations return that, so just do it for now
        // TODO: whenever babbling adds getRecentsMap, use that
        return this.getMediaMapBy((p) =>
            p.getRecommendationsMap(queryErrorHandler),
        );
    }

    public async queryRecommended(context: Context): Promise<IMediaResultsMap> {
        return this.getMediaMapBy((p) =>
            p.getRecommendationsMap(queryErrorHandler),
        );
    }

    private async getMediaMapBy(predicate: (player: Player) => any) {
        const player = await this.getPlayer();
        const map = player.getRecommendationsMap(queryErrorHandler);
        return Object.keys(map).reduce((m, k) => {
            const results = map[k];
            m[k] = transformQueryResultsToPlayableMedia(player, results);
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

async function* transformQueryResultsToPlayableMedia(
    player: Player,
    results: AsyncIterable<IQueryResult>,
) {
    for await (const result of results) {
        yield resultToMedia(player, result);
    }
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

        async play(opts) {
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
