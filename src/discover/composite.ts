import { mergeAsyncIterables } from "babbling/dist/async";

import { Context } from "../context";
import { IMedia } from "../model";
import { DiscoveryId, IDiscoveredChange, IDiscovery } from "./base";

export class CompositeDiscovery implements IDiscovery {
    public static create(
        ... delegates: IDiscovery[]
    ) {
        return new CompositeDiscovery(
            "composite",
            delegates,
        );
    }

    constructor(
        public readonly id: DiscoveryId,
        private readonly delegates: IDiscovery[],
    ) {}

    public async *changes(): AsyncIterable<IDiscoveredChange> {
        yield *mergeAsyncIterables(
            this.delegates.map(it => it.changes()),
        );
    }

    public async createPlayable(
        context: Context,
        media: IMedia,
    ) {
        const instance = this.instanceById(media.discovery);
        if (!instance) {
            throw new Error(
                `${media.id} provided by unknown: ${media.discovery}`,
            );
        }

        return instance.createPlayable(context, media);
    }

    public async *discover(): AsyncIterable<IMedia> {
        yield *mergeAsyncIterables(
            this.delegates.map(it => it.discover()),
        );
    }

    public instanceById(id: DiscoveryId): IDiscovery | undefined {
        for (const delegate of this.delegates) {
            const found = delegate.instanceById(id);
            if (found) return found;
        }
    }
}
