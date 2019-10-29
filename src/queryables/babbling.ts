import _debug from "debug";
const debug = _debug("shougun:queryable:babbling");

import { ChromecastDevice, PlayerBuilder } from "babbling";

import { Context } from "../context";
import { IMedia, IPlayableMedia, IQueryable, MediaType } from "../model";

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

        for await (const result of iterable) {
            yield {
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

    private async getPlayer() {
        const builder = await PlayerBuilder.autoInflate(this.configPath);

        if (this.chromecastDeviceName) {
            builder.addDevice(new ChromecastDevice(this.chromecastDeviceName));
        }

        return builder.build();
    }

}