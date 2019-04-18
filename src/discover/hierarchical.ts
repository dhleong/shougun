import _debug from "debug";
const debug = _debug("shougun:hierarchical");

import { Context } from "../context";
import { fileNameToId, fileNameToTitle, isVideo, nestId } from "../media/util";
import { IMedia, IMediaMap, IPlayable, ISeries, MediaType } from "../model";
import { DiscoveryId, IDiscovery } from "./base";

export interface IHierarchy<TEntity> {
    equals(first: TEntity, second: TEntity): boolean;

    nameOf(entity: TEntity): string;
    parentOf(entity: TEntity): Promise<TEntity>;
    childrenOf(entity: TEntity): Promise<TEntity[] | null>;

    createPlayable(
        context: Context,
        entity: TEntity,
    ): Promise<IPlayable>;
}

export abstract class HierarchicalDiscovery<TEntity> implements IDiscovery {
    public abstract id: DiscoveryId;

    constructor(
        private hierarchy: IHierarchy<TEntity>,
        private root: TEntity,
    ) { }

    public instanceById(id: DiscoveryId): IDiscovery | undefined {
        if (id !== this.id) return;
        return this;
    }

    public async createPlayable(
        context: Context,
        media: IMedia,
    ) {
        // NOTE: this should only be called with media that
        // we created, so it should always have this property.
        // if not, it is user error
        const entity = (media as any).entity as TEntity;
        if (!entity) {
            throw new Error(
                `${this.id} provided media created by other Discovery (${media.discovery})`,
            );
        }

        return this.hierarchy.createPlayable(
            context,
            entity,
        );
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

            // guess series/season structures
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
        if (this.hierarchy.equals(this.root, candidate)) {
            // videos in the root directory must be Movies
            for (const video of videoFiles) {
                yield this.createMedia(null, MediaType.Movie, video);
            }
            return;
        }

        const parent = await this.hierarchy.parentOf(candidate);
        const parentId = this.idOf(parent);
        const parentAsSeries = discovered[parentId];
        if (parentAsSeries) {
            // EG: /Nodame/SPECIAL
            // this is a new season belonging to parentId
            (parentAsSeries as ISeries).seasons.push(this.createSeason(
                candidate,
                parentId,
                this.createTitle(candidate),
                videoFiles,
            ));
            return;
        }

        const grandParent = await this.hierarchy.parentOf(parent);
        if (this.hierarchy.equals(this.root, grandParent)) {
            debug("grand @", candidate);
            // EG: /Korra/Book 1; Korra/Book 2
            // if the grandparent is the root, then this
            // must be a season
            const series: ISeries = discovered[parentId] as ISeries || {
                discovery: this.id,
                id: parentId,
                title: this.createTitle(parent),
                type: MediaType.Series,

                seasons: [],
            };

            series.seasons.push(this.createSeason(
                candidate,
                series.id,
                this.createTitle(candidate),
                videoFiles,
            ));

            yield series;
            return;
        }

        debug("single-season @", candidate);

        // single-season show
        const seriesId = this.idOf(candidate);
        yield {
            discovery: this.id,
            id: seriesId,
            title: this.createTitle(candidate),
            type: MediaType.Series,

            seasons: [
                this.createSeason(candidate, seriesId, undefined, videoFiles),
            ],
        };
    }

    private createTitle(entity: TEntity) {
        const name = this.hierarchy.nameOf(entity);
        return fileNameToTitle(name);
    }

    private createSeason(
        entry: TEntity,
        seriesId: string,
        title: string | undefined,
        videoFiles: TEntity[],
    ) {
        const id = nestId(seriesId, this.idOf(entry));
        return {
            episodes: videoFiles.map(f =>
                this.createMedia(id, MediaType.Episode, f, {
                    seriesId,
                }),
            ),
            id,
            seriesId,
            title,
        };
    }

    private createMedia<T extends {}>(
        parentId: string | null,
        type: MediaType,
        entity: TEntity,
        extra?: T,
    ) {
        return Object.assign({
            discovery: this.id,
            id: parentId
                ? nestId(parentId, this.idOf(entity))
                : this.idOf(entity),
            title: this.createTitle(entity),
            type,

            entity,
        }, extra);
    }

    private idOf(entry: TEntity) {
        return fileNameToId(this.hierarchy.nameOf(entry));
    }
}
