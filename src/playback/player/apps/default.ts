import _debug from "debug";
const debug = _debug("shougun:cast:default");

import { awaitMessageOfType, BaseApp, ICastSession, IDevice, PlaybackTracker } from "babbling";

import { IMediaMetadata } from "../../../model";

export interface IMedia {
    contentId: string;
    contentType: string;
    metadata: IMediaMetadata;
    streamType: "BUFFERED";
}

export interface ILoadParams {
    contentType: any;
    currentTime?: number;
    url: string;
    metadata?: IMediaMetadata;

    /**
     * Callback that can be used for tracking "last watched"
     */
    onPlayerPaused?: (currentTimeSeconds: number) => Promise<void>;
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

function formatLoadRequest(
    params: ILoadParams,
) {
    const media = {
        contentId: params.url,
        contentType: params.contentType,
        metadata: formatMetadata(params.metadata),
    };
    return {
        autoplay: true,
        currentTime: params.currentTime,
        media,
        type: "LOAD",
    };
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

export class DefaultMediaReceiverApp extends BaseApp {

    protected tracker: PlaybackTracker | undefined;

    constructor(device: IDevice) {
        super(device, {
            appId: "CC1AD845",
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

        s.send(formatLoadRequest(params));

        // wait for either the playback to start or the load to fail
        const result = await Promise.race([
            awaitPlaybackStart(s),
            awaitLoadFailure(s),
        ]);

        if (!result) throw new Error("No result?");

        debug("playback started", result);
    }

}
