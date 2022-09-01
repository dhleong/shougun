import { IEpisodeQuery } from "babbling/dist/app";

import type { Context } from "../context";
import { IMedia, IPlayable } from "../model";

export type DiscoveryId = string;

export enum ChangeType {
    MEDIA_ADDED,
    MEDIA_CHANGED,
    MEDIA_REMOVED,
}

export interface IDiscoveredChange {
    type: ChangeType;
    media: IMedia;
}

export interface IDiscovery {
    id: DiscoveryId;

    changes(context: Context): AsyncIterable<IDiscoveredChange>;
    createPlayable(context: Context, media: IMedia): Promise<IPlayable>;
    discover(): AsyncIterable<IMedia>;
    findEpisodeFor(
        context: Context,
        media: IMedia,
        query: IEpisodeQuery,
    ): Promise<IMedia | undefined>;
    findByPath(context: Context, path: string): Promise<IMedia | undefined>;
    getLocalPath(context: Context, media: IMedia): Promise<string | undefined>;
    instanceById(id: DiscoveryId): IDiscovery | undefined;
}
