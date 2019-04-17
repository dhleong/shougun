import { mergeAsyncIterables } from "babbling/dist/async";

import { IMedia } from "../model";
import { DiscoveryId, IDiscovery } from "./base";

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

    public async *discover(): AsyncIterable<IMedia> {
        yield *mergeAsyncIterables(
            this.delegates.map(it => it.discover()),
        );
    }
}
