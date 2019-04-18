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
    durationSeconds: number;
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

export interface IEpisode extends IMedia {
    seriesId: string;
}

export interface ISeason {
    id: string;
    number?: number;
    title?: string;

    episodes: IEpisode[];
}

export function isEpisode(media: IMedia): media is IEpisode {
    return media.type === MediaType.Episode;
}

export function isSeries(media: IMedia): media is ISeries {
    return media.type === MediaType.Series;
}
