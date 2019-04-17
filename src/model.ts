import { DiscoveryId } from "./discover/base";

export interface ILocalMedia {
    id: string;
    contentType: string;
    localPath: string;
}

export interface IMediaMetadata {
    title?: string;
}

export interface IPlayable {
    id: string;
    contentType: string;
    getMetadata(): Promise<IMediaMetadata>;
    getUrl(): Promise<string>;
}

export enum MediaType {
    Episode,
    Movie,
    Series,
}

export interface IMedia {
    id: string;
    title: string;
    type: MediaType;

    /** ID of the discovery that provides this media */
    discovery: DiscoveryId;
}

export interface IMediaMap {
    [id: string]: IMedia;
}

export interface ISeries extends IMedia {
    seasons: ISeason[];
}

export interface ISeason {
    id: string;
    number?: number;
    title?: string;

    episodes: IMedia[];
}

export function isSeries(media: IMedia): media is ISeries {
    return media.type === MediaType.Series;
}
