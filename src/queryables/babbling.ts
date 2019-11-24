import _debug from "debug";
const debug = _debug("shougun:queryable:babbling");

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

type PromiseType<T> = T extends Promise<infer P> ? P : never;
type Player = PromiseType<ReturnType<BabblingQueryable["getPlayer"]>>;

export class BabblingQueryable implements IQueryable {

    constructor(
        private readonly configPath?: string,
        private readonly chromecastDeviceName?: string,
    ) { }

    public async *findMedia(
        context: Context,
        query: string,
    ): AsyncIterable<IMedia> {
        const player = await this.getPlayer();
        const iterable = player.queryByTitle(query, (app, e) => {
            debug("error querying", app, e);
        });

        yield *transformQueryResultsToPlayableMedia(player, iterable);
    }

    public async queryRecent(
        context: Context,
    ): Promise<IMediaResultsMap> {
        // NOTE: babbling doesn't technically support recents yet, but actually
        // all the implementations return that, so just do it for now
        // TODO: whenever babbling adds getRecentsMap, use that
        return this.getMediaMapBy(p => p.getRecommendationsMap());
    }

    public async queryRecommended(
        context: Context,
    ): Promise<IMediaResultsMap> {
        return this.getMediaMapBy(p => p.getRecommendationsMap());
    }

    private async getMediaMapBy(predicate: (player: Player) => any) {
        const player = await this.getPlayer();
        const map = player.getRecommendationsMap();
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

async function *transformQueryResultsToPlayableMedia(
    player: any,
    results: AsyncIterable<IQueryResult>,
) {
    for await (const result of results) {
        yield {
            cover: (result as any).cover,
            discovery: `babbling:${result.appName}`,
            id: result.url || `${result.appName}:${result.title}`,
            title: result.title,
            type: MediaType.ExternalPlayable,

            async play(opts) {
                await player.play(result);
            },
        } as IPlayableMedia;
    }
}
