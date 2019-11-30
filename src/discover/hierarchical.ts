import _debug from "debug";
const debug = _debug("shougun:hierarchical");

import { Context } from "../context";
import { fileNameToId, fileNameToTitle, fileType, nestId, sortEpisodes, sortSeasons } from "../media/util";
import { IMedia, IMediaMap, IPlayable, ISeason, ISeries, MediaType } from "../model";
import { groupBy } from "../util/collection";
import { DiscoveryId, IDiscoveredChange, IDiscovery } from "./base";

export interface IHierarchy<TEntity> {
    equals(first: TEntity, second: TEntity): boolean;

    nameOf(entity: TEntity): string;
    parentOf(entity: TEntity): Promise<TEntity>;
    childrenOf(entity: TEntity): Promise<TEntity[] | null>;

    createPlayable(
        context: Context,
        media: IMedia,
        entity: TEntity,
        coverEntity?: TEntity,
    ): Promise<IPlayable>;
}

export interface IHierarchicalMedia<TEntity> extends IMedia {
    coverEntity?: TEntity;
    entity: TEntity;
    seasons?: ISeason[];
}

export abstract class HierarchicalDiscovery<TEntity> implements IDiscovery {
    public abstract id: DiscoveryId;

    constructor(
        private readonly hierarchy: IHierarchy<TEntity>,
        protected readonly root: TEntity,
    ) { }

    public abstract changes(): AsyncIterable<IDiscoveredChange>;
    public abstract getLocalPath(
        context: Context,
        media: IMedia,
    ): Promise<string | undefined>;

    public instanceById(id: DiscoveryId): IDiscovery | undefined {
        if (id !== this.id) return;
        return this;
    }

    public async createPlayable(
        context: Context,
        media: IMedia,
    ) {
        const entity = this.ensureEntity(media);

        const coverEntity: TEntity | undefined =
            (media as IHierarchicalMedia<TEntity>).coverEntity;

        return this.hierarchy.createPlayable(
            context,
            media,
            entity,
            coverEntity,
        );
    }

    public async *discover(): AsyncIterable<IMedia> {
        // this is kind of terrible, but a strictly greedy
        // algorithm doesn't provide great results....
        const discovered: IMediaMap = {};
        for await (const m of this.discoverFromRoot(discovered, this.root)) {
            discovered[m.id] = m;
        }

        for (const m of Object.values(discovered)) {
            yield m;
        }
    }

    protected createRootMedia(
        videoPath: TEntity,
    ) {
        return this.createMedia(null, MediaType.Movie, videoPath);
    }

    protected async *discoverFromRoot(
        discovered: IMediaMap,
        root: TEntity,
    ) {
        const candidates: TEntity[] = [root];

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

            const {
                image: imageFiles,
                video: videoFiles,
            } = groupBy(children, it => fileType(
                this.hierarchy.nameOf(it),
            ));
            if (!videoFiles || !videoFiles.length) {
                // no videos in this directory; ignore
                continue;
            }

            // found videos! this could be a movie, a season, or a series...
            yield *this.extractMedia(
                discovered,
                candidate,
                videoFiles,
                imageFiles || [],
            );
        }
    }

    protected ensureEntity(media: IMedia) {
        // NOTE: this should only be called with media that
        // we created, so it should always have this property.
        // if not, it is user error
        const entity = (media as IHierarchicalMedia<TEntity>).entity;
        if (!entity) {
            if (media.discovery !== this.id) {
                throw new Error(
                    `${this.id} was given media created by other Discovery (${media.discovery})`,
                );
            }

            throw new Error(`Media (${media.type}: ${media.id}) did not have an entity attached`);
        }
        return entity;
    }

    private async *extractMedia(
        discovered: IMediaMap,
        candidate: TEntity,
        videoFiles: TEntity[],
        imageFiles: TEntity[],
    ): AsyncIterable<IHierarchicalMedia<TEntity>>  {
        if (this.hierarchy.equals(this.root, candidate)) {
            // videos in the root directory must be Movies
            for (const video of videoFiles) {
                yield this.createRootMedia(video);
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
            sortSeasons((parentAsSeries as ISeries).seasons);
            return;
        }

        const grandParent = await this.hierarchy.parentOf(parent);
        if (this.hierarchy.equals(this.root, grandParent)) {
            debug("grand @", candidate);

            // EG: /Korra/Book 1; Korra/Book 2
            // if the grandparent is the root, then this
            // must be a season
            const series: IHierarchicalMedia<TEntity> & ISeries =
            discovered[parentId] as IHierarchicalMedia<TEntity> & ISeries || {
                coverEntity: this.pickCoverImage(
                    await this.hierarchy.childrenOf(parent),
                ),
                discovery: this.id,
                entity: parent,
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

            sortSeasons(series.seasons);
            yield series;
            return;
        }

        if (videoFiles.length === 1) {
            debug("movie @", candidate);
            yield {
                coverEntity: this.pickCoverImage(imageFiles),
                discovery: this.id,
                entity: videoFiles[0],
                id: this.idOf(candidate),
                title: this.createTitle(candidate),
                type: MediaType.Movie,
            };
            return;
        }

        debug("single-season @", candidate);

        // single-season show
        const seriesId = this.idOf(candidate);
        yield {
            coverEntity: this.pickCoverImage(imageFiles),
            discovery: this.id,
            entity: candidate,
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
        const episodes = sortEpisodes(
           videoFiles.map(f =>
                this.createMedia(id, MediaType.Episode, f, {
                    seriesId,
                }),
            ),
        );
        return {
            episodes,
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

    private pickCoverImage(candidates: TEntity[] | null | undefined) {
        if (!candidates || !candidates.length) return;

        // TODO pick better?
        return candidates[0];
    }
}
