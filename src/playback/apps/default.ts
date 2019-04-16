import { awaitMessageOfType, BaseApp, IDevice } from "babbling";

import { IMediaMetadata } from "../model";

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
}

function formatMetadata(
    metadata?: IMediaMetadata,
) {
    if (!metadata) return;

    // TODO;
    return Object.assign({
        streamType: "BUFFERED",
    }, metadata || {});
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

export class DefaultMediaReceiverApp extends BaseApp {
    constructor(device: IDevice) {
        super(device, {
            appId: "CC1AD845",
            sessionNs: "urn:x-cast:com.google.cast.media",
        });
    }

    public async load(params: ILoadParams) {
        const s = await this.ensureCastSession();

        s.send(formatLoadRequest(params));

        await Promise.race([
            (async () => {
                let ms: any;
                do {
                    ms = await awaitMessageOfType(s, "MEDIA_STATUS");
                } while (
                    !ms.status.length
                    || !(
                        ms.status[0].playerStatus === "BUFFERING"
                        || ms.status[0].playerStatus === "PLAYING"
                    )
                );
            })(),

            (async () => {
                try {
                    await awaitMessageOfType(s, "LOAD_FAILED");
                    throw new Error("Load failed");
                } catch (e) {
                    // timeout; ignroe
                }
            })(),
        ]);
    }
}
