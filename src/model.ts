import { Context } from "./context";
import { DiscoveryId } from "./discover/base";
import { IPlaybackOptions } from "./playback/player";

export interface ILocalMedia {
    id: string;
    contentType: string;
    localPath: string;
}

export interface IMediaMetadata {
    title?: string;
    seriesTitle?: string;
}

export interface IPlayable {
    id: string;
    contentType: string;
    durationSeconds: number;
    getMetadata(context: Context): Promise<IMediaMetadata>;

    /**
     * Get an URL that can be used to stream the media represented
     * by this playable. `opts` can be used as a hint for EG the
     * time to start streaming, if appropriate. For example, if
     * the URL points to a transcoded stream that doesn't support
     * seeking, it may *start transcoding* at that time instead.
     * However, if seek *is* supported, `opts` will be disregarded.
     */
    getUrl(opts?: IPlaybackOptions): Promise<string>;
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
