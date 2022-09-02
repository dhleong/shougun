import { IEpisodeQuery } from "babbling/dist/app";
import { mergeAsyncIterables } from "babbling/dist/async";

import { Context } from "../context";
import { IMedia } from "../model";
import { anyPromise } from "../util/any-promise";
import { DiscoveryId, IDiscoveredChange, IDiscovery } from "./base";

export class CompositeDiscovery implements IDiscovery {
    public static create(...delegates: IDiscovery[]) {
        return new CompositeDiscovery("composite", delegates);
    }

    constructor(
        public readonly id: DiscoveryId,
        private readonly delegates: IDiscovery[],
    ) {}

    public async *changes(context: Context): AsyncIterable<IDiscoveredChange> {
        yield* mergeAsyncIterables(
            this.delegates.map((it) => it.changes(context)),
        );
    }

    public async createPlayable(context: Context, media: IMedia) {
        const instance = this.instanceForMedia(media);
        return instance.createPlayable(context, media);
    }

    public async *discover(): AsyncIterable<IMedia> {
        yield* mergeAsyncIterables(this.delegates.map((it) => it.discover()));
    }

    public async findByPath(context: Context, media: string) {
        return anyPromise(
            this.delegates.map((d) => d.findByPath(context, media)),
        );
    }

    public async findEpisodeFor(
        context: Context,
        media: IMedia,
        query: IEpisodeQuery,
    ) {
        const discovery = this.instanceById(media.discovery);
        if (!discovery) throw new Error(`Unknown discovery ${media.discovery}`);
        return discovery.findEpisodeFor(context, media, query);
    }

    public async getLocalPath(context: Context, media: IMedia) {
        const instance = this.instanceForMedia(media);
        return instance.getLocalPath(context, media);
    }

    public instanceById(id: DiscoveryId): IDiscovery | undefined {
        for (const delegate of this.delegates) {
            const found = delegate.instanceById(id);
            if (found) return found;
        }
    }

    private instanceForMedia(media: IMedia) {
        const instance = this.instanceById(media.discovery);
        if (!instance) {
            throw new Error(
                `${media.id} provided by unknown: ${media.discovery}`,
            );
        }
        return instance;
    }
}
