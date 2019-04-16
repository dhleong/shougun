import _debug from "debug";
const debug = _debug("shougun:hierarchical");

import { IMedia, IPlayable, MediaType } from "../model";
import { IDiscovery } from "./base";

export interface IHierarchy<TEntity> {
    idOf(entity: TEntity): string;
    parentOf(entity: TEntity): Promise<TEntity>;
    childrenOf(entity: TEntity): Promise<TEntity[] | null>;
    playableFactory(entity: TEntity): () => Promise<IPlayable>;
}

export class HierarchicalDiscovery<TEntity> implements IDiscovery {
    constructor(
        private hierarchy: IHierarchy<TEntity>,
        private root: TEntity,
    ) {}

    public async *discover(): AsyncIterable<IMedia> {
        const candidates: TEntity[] = [this.root];

        while (candidates.length) {
            const candidate = candidates.pop();
            if (!candidate) throw new Error("Illegal state");

            // TODO guess series/season structures
            const children = await this.hierarchy.childrenOf(candidate);
            if (children === null) {
                // this is a file
                // FIXME: not necessarily an episode
                yield {
                    createPlayable: this.hierarchy.playableFactory(candidate),
                    id: this.hierarchy.idOf(candidate),
                    type: MediaType.Episode,
                };
                return;
            }

            debug("new candidates:", children);
            candidates.push(...children);
        }
    }
}
