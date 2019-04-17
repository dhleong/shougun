import _debug from "debug";
const debug = _debug("shougun:hierarchical");

import { fileNameToTitle, isVideo } from "../media/util";
import { IMedia, IMediaMap, IPlayable, ISeries, MediaType } from "../model";
import { IDiscovery } from "./base";

export interface IHierarchy<TEntity> {
    idOf(entity: TEntity): string;
    nameOf(entity: TEntity): string;
    parentOf(entity: TEntity): Promise<TEntity>;
    childrenOf(entity: TEntity): Promise<TEntity[] | null>;
    playableFactory(entity: TEntity): () => Promise<IPlayable>;
}

export abstract class HierarchicalDiscovery<TEntity> implements IDiscovery {
    public abstract id: string;

    private readonly rootId: string;

    constructor(
        private hierarchy: IHierarchy<TEntity>,
        private root: TEntity,
    ) {
        this.rootId = this.hierarchy.idOf(root);
    }

    public async *discover(): AsyncIterable<IMedia> {
        // this is kind of terrible, but a strictly greedy
        // algorithm doesn't provide great results....
        const discovered: IMediaMap = {};
        for await (const m of this.discoverImpl(discovered)) {
            discovered[m.id] = m;
        }

        for (const m of Object.values(discovered)) {
            yield m;
        }
    }

    private async *discoverImpl(
        discovered: IMediaMap,
    ): AsyncIterable<IMedia> {
        const candidates: TEntity[] = [this.root];

        while (candidates.length) {
            const candidate = candidates.pop();
            if (!candidate) throw new Error("Illegal state");

            // TODO guess series/season structures
            const children = await this.hierarchy.childrenOf(candidate);
            if (children === null) {
                // not a directory
                continue;
            }

            candidates.push(...children);

            const videoFiles = children.filter(it => isVideo(
                this.hierarchy.nameOf(it),
            ));
            if (!videoFiles.length) {
                // no videos in this directory; ignore
                continue;
            }

            // found videos! this could be a movie, a season, or a series...
            yield *this.extractMedia(
                discovered,
                candidate,
                videoFiles,
            );
        }
    }

    private async *extractMedia(
        discovered: IMediaMap,
        candidate: TEntity,
        videoFiles: TEntity[],
    ) {
        const candidateId = this.hierarchy.idOf(candidate);
        if (this.rootId === candidateId) {
            // videos in the root directory must be Movies
            for (const video of videoFiles) {
                yield this.createMedia(MediaType.Movie, video);
            }
            return;
        }

        const parent = await this.hierarchy.parentOf(candidate);
        const parentId = this.hierarchy.idOf(parent);
        const parentAsSeries = discovered[parentId];
        if (parentAsSeries) {
            // EG: /Nodame/SPECIAL
            // TODO this is a new season belonging to parentId
            return;
        }

        const grandParent = await this.hierarchy.parentOf(parent);
        const grandId = this.hierarchy.idOf(grandParent);
        if (this.rootId === grandId) {
            debug("grand @", candidate);
            // EG: /Korra/Book 1; Korra/Book 2
            // TODO if the grandparent is the root, then this
            // must be a season
            const series: ISeries = discovered[parentId] as ISeries || {
                discovery: this.id,
                id: parentId,
                title: this.createTitle(parent),
                type: MediaType.Series,

                seasons: [],
            };

            series.seasons.push(this.createSeason(
                candidateId,
                videoFiles,
            ));

            yield series;
            return;
        }

        debug("single-season @", candidate);

        // single-season show
        yield {
            discovery: this.id,
            id: candidateId,
            title: this.createTitle(candidate),
            type: MediaType.Series,

            seasons: [
                this.createSeason(candidateId, videoFiles),
            ],
        };
    }

    private createTitle(entity: TEntity) {
        const name = this.hierarchy.nameOf(entity);
        return fileNameToTitle(name);
    }

    private createSeason(
        id: string,
        videoFiles: TEntity[],
    ) {
        return {
            episodes: videoFiles.map(f =>
                this.createMedia(MediaType.Episode, f),
            ),
            id,
        };
    }

    private createMedia(type: MediaType, entity: TEntity) {
        return {
            discovery: this.id,
            id: this.hierarchy.idOf(entity),
            title: this.createTitle(entity),
            type,

            entity,
        };
    }
}
