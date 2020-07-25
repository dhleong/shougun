import _debug from "debug";
const debug = _debug("shougun:cast:generic");

import { awaitMessageOfType, BaseApp, ICastSession, IDevice, PlaybackTracker } from "babbling";

import { IMedia, IMediaMetadata } from "../../../model";
import { ShougunPlaybackTracker } from "./tracker";

export interface ICustomCastData {
    durationSeconds?: number;
    preferredAudioLanguage?: string;
    queueIndex?: number;
    startTimeAbsolute?: number;
}

export interface ICastInfo {
    contentType: any;
    currentTime?: number;
    customData?: ICustomCastData;

    /**
     * Total duration of the media, in seconds. *Should* be provided
     * if the media is to be transcoded
     */
    duration?: number;

    id: string;
    url: string;
    metadata?: IMediaMetadata;

    source: IMedia;
}

export interface ILoadParams {
    /**
     * The thing to play
     */
    media: ICastInfo;

    /**
     * If present, the audio language to prefer instead of
     * the default track (if possible)
     */
    preferredAudioLanguage?: string;

    /**
     * A list of ICastInfo objects around (and including)
     * `media`
     */
    queueAround?: ICastInfo[];

    /**
     * Callback that can be used for tracking "last watched"
     */
    onPlayerPaused?: (
        media: IMedia,
        currentTimeSeconds: number,
    ) => Promise<void>;

    /**
     * Callback when the player has been stopped---either from the
     * app being closed, or from the queue being cleared---that can
     * be used for releasing any resources the player is holding onto
     * (ex: keeping the server running to handle queues)
     */
    onPlayerStop?: () => void;
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

    if (metadata.coverUrl) {
        formatted.posterUrl = metadata.coverUrl;
        formatted.images = [ { url: metadata.coverUrl } ];
    }

    return formatted;
}

function formatCastInfo(info: ICastInfo) {
    return {
        contentId: info.id,
        contentType: info.contentType,
        contentUrl: info.url,
        duration: info.duration,
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
    const m = await awaitMessageOfType(s, "LOAD_FAILED");
    debug("load failed:", m);
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
            if (this.tracker) this.tracker.stop();

            const tracker = new ShougunPlaybackTracker(this, params);
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

    public close() {
        this.device.stop();
    }

    protected formatLoadRequest(params: ILoadParams) {
        return formatLoadRequest(params);
    }

}
