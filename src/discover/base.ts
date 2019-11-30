import { Context } from "../context";
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

    changes(): AsyncIterable<IDiscoveredChange>;
    createPlayable(context: Context, media: IMedia): Promise<IPlayable>;
    discover(): AsyncIterable<IMedia>;
    getLocalPath(context: Context, media: IMedia): Promise<string | undefined>;
    instanceById(id: DiscoveryId): IDiscovery | undefined;
}
