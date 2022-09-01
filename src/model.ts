import { IEpisodeQuery } from "babbling/dist/app";

import { Context } from "./context";
import { DiscoveryId } from "./discover/base";
import { IVideoAnalysis } from "./media/analyze";
import { IPlaybackOptions } from "./playback/player";

export interface ILocalMedia {
    id: string;

    /**
     * The backing IMedia this represents (if any)
     */
    media?: IMedia;

    contentType: string;
    localPath: string;
}

export interface IMediaMetadata {
    coverUrl?: string;
    title?: string;
    seriesTitle?: string;
}

export interface IPlayable {
    readonly id: string;
    readonly contentType: string;
    readonly durationSeconds: number;

    /**
     * The backing IMedia this represents
     */
    readonly media: IMedia;

    loadQueueAround(context: Context): Promise<IMedia[]>;

    /**
     * If available (IE: a local media file), fetch an analysis
     * of the media
     */
    analyze?(): Promise<IVideoAnalysis>;

    /**
     * Get an URL that can be used to stream the media represented
     * by this playable. `opts` can be used as a hint for EG the
     * time to start streaming, if appropriate. For example, if
     * the URL points to a transcoded stream that doesn't support
     * seeking, it may *start transcoding* at that time instead.
     * However, if seek *is* supported, `opts` will be disregarded.
     */
    getUrl(context: Context, opts?: IPlaybackOptions): Promise<string>;

    /**
     * Get an URL from which the cover image can be downloaded, if any
     */
    getCoverUrl?(context: Context): Promise<string | undefined>;
}

export interface IPlayableWithClients extends IPlayable {
    addActiveClient(client: string): void;
    removeActiveClient(client: string): void;
}

/** Check if the given IPlayable supports having clients */
export function supportsClients(
    playable: IPlayable,
): playable is IPlayableWithClients {
    return (playable as any).addActiveClient;
}

export enum MediaType {
    Episode,
    Movie,
    Series,

    /**
     * If a media's type is ExternalPlayable, it MUST implement
     * [IPlayableMedia]
     */
    ExternalPlayable,
}

export interface IMediaPrefs {
    preferredAudioLanguage?: string;
    preferredSubtitleLanguage?: string;
}

export interface IMedia {
    id: string;
    title: string;
    type: MediaType;

    prefs?: IMediaPrefs;

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

export interface IMediaResultsMap {
    [source: string]: AsyncIterable<IMedia>;
}

/*
 * Queryable abstraction
 */
export interface IQueryable {
    queryRecent(context: Context): Promise<IMediaResultsMap>;
    queryRecommended(context: Context): Promise<IMediaResultsMap>;
    findMedia(context: Context, query: string): AsyncIterable<IMedia>;
}

export interface IPlayableMedia extends IMedia {
    play(opts: IPlaybackOptions): Promise<void>;
    findEpisode?(
        context: Context,
        query: IEpisodeQuery,
    ): Promise<IMedia | undefined>;
}

export function isPlayable(media: IMedia): media is IPlayableMedia {
    if (media.type !== MediaType.ExternalPlayable) return false;
    if (typeof (media as any).play !== "function") {
        throw new Error(
            `Media is ExternalPlayable but does not implement IPlayableMedia: ${media}`,
        );
    }
    return true;
}
