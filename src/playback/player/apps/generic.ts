import _debug from "debug";
const debug = _debug("shougun:cast:generic");

import { awaitMessageOfType, BaseApp, ICastSession, IDevice, PlaybackTracker } from "babbling";

import { IMediaMetadata } from "../../../model";

export interface ICustomCastData {
    queueIndex?: number;
    startTimeAbsolute?: number;
}

export interface ICastInfo {
    contentType: any;
    currentTime?: number;
    customData?: ICustomCastData;
    url: string;
    metadata?: IMediaMetadata;
}

export interface ILoadParams {
    /**
     * The thing to play
     */
    media: ICastInfo;

    /**
     * A list of ICastInfo objects around (and including)
     * `media`
     */
    queueAround?: ICastInfo[];

    /**
     * Callback that can be used for tracking "last watched"
     */
    onPlayerPaused?: (currentTimeSeconds: number) => Promise<void>;
}

export interface IQueueData {
    items: Array<{
        media: {
            contentId: string,
            contentType: string,
        },
        customData?: ICustomCastData,
    }>;
    startIndex: number;
}

export enum MetadataType {
    Generic,
    Movie,
    TvShow,
}

function formatMetadata(
    metadata?: IMediaMetadata,
) {
    if (!metadata) return;

    const formatted: any = {
        streamType: "BUFFERED",
        title: metadata.title,
    };

    if (metadata.seriesTitle) {
        formatted.metadataType = MetadataType.TvShow;
        formatted.seriesTitle = metadata.seriesTitle;
    }

    return formatted;
}

function formatCastInfo(info: ICastInfo) {
    return {
        contentId: info.url,
        contentType: info.contentType,
        metadata: formatMetadata(info.metadata),
    };
}

function formatLoadRequest(
    params: ILoadParams,
) {
    const media = formatCastInfo(params.media);

    const request = {
        autoplay: true,
        currentTime: params.media.currentTime,
        customData: params.media.customData,
        media,
        queueData: undefined as unknown as IQueueData,
        type: "LOAD",
    };

    if (params.queueAround && params.queueAround.length) {
        request.queueData = {
            items: params.queueAround.map(item => ({
                customData: item.customData,
                media: formatCastInfo(item),
            })),
            startIndex: params.queueAround.findIndex(
                item => item.url === params.media.url,
            ),
        };
    }

    return request;
}

async function awaitPlaybackStart(s: ICastSession) {
    let ms: any;
    do {
        ms = await awaitMessageOfType(s, "MEDIA_STATUS");
        debug("received", ms);
    } while (
        !ms.status.length
        || !(
            ms.status[0].playerState === "BUFFERING"
                || ms.status[0].playerState === "PLAYING"
        )
    );
    debug("found!", ms);
    return ms;
}

async function awaitLoadFailure(s: ICastSession) {
    debug("check for load");
    await awaitMessageOfType(s, "LOAD_FAILED");
    throw new Error("Load failed");
}

export class GenericMediaReceiverApp extends BaseApp {

    protected tracker: PlaybackTracker | undefined;

    constructor(device: IDevice, opts: { appId: string }) {
        super(device, {
            appId: opts.appId,
            sessionNs: "urn:x-cast:com.google.cast.media",
        });
    }

    public async load(params: ILoadParams) {

        if (params.onPlayerPaused) {
            const tracker = new PlaybackTracker(this, {
                onPlayerPaused: params.onPlayerPaused,
            });
            this.tracker = tracker;
            tracker.start();
        }

        const s = await this.ensureCastSession();

        const loadRequest = formatLoadRequest(params);
        s.send(loadRequest);
        debug("sending", JSON.stringify(loadRequest, null, "  "));

        // wait for either the playback to start or the load to fail
        const result = await Promise.race([
            awaitPlaybackStart(s),
            awaitLoadFailure(s),
        ]);

        if (!result) throw new Error("No result?");

        debug("playback started", result);
    }

    protected formatLoadRequest(params: ILoadParams) {
        return formatLoadRequest(params);
    }

}
