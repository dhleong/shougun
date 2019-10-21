import { ChromecastDevice } from "babbling";

import { Context } from "../../context";
import { getMetadata } from "../../media/metadata";
import { IPlayable } from "../../model";
import { withQuery } from "../../util/url";
import { IPlaybackOptions, IPlayer, IPlayerCapabilities } from "../player";
import { DefaultMediaReceiverApp } from "./apps/default";
import { ICastInfo } from "./apps/generic";
import { ShougunPlayerApp } from "./apps/shougun-player";

const chromecastCapabilities = {
    supportedMimes: new Set<string>([
        "video/mp4", "video/webm",
        "audio/mp4", "audio/mpeg", "audio/webm",
    ]),

    canPlayMime(mime: string) {
        return this.supportedMimes.has(mime);
    },

    effectiveMime(mime: string) {
        if (this.canPlayMime(mime)) {
            return mime;
        }

        return "video/mp4"; // transcode to mp4
    },
};

export class ChromecastPlayer implements IPlayer {
    public static forNamedDevice(deviceName: string) {
        return new ChromecastPlayer(new ChromecastDevice(deviceName));
    }

    constructor(
        private device: ChromecastDevice,
    ) { }

    public getCapabilities(): IPlayerCapabilities {
        return chromecastCapabilities;
    }

    public async play(
        context: Context,
        playable: IPlayable,
        opts: IPlaybackOptions = {},
    ) {
        let urlOpts: IPlaybackOptions | undefined;

        let currentTime = opts.currentTime;
        if (!currentTime) {
            currentTime = 0;
        } else if (!chromecastCapabilities.canPlayMime(playable.contentType)) {
            // this content cannot be streamed to Chromecast,
            // so we *cannot* provide currentTime, and instead
            // should pass it to getUrl()
            // FIXME: if we use ShougunPlayerApp, *can we* actually send
            // currentTime?
            urlOpts = { currentTime };
            currentTime = 0;
        }

        const appType = pickAppTypeFor(playable);
        const [ app, metadata, url, mediaAround ] = await Promise.all([
            this.device.openApp(appType),
            getMetadata(context, playable.media),
            playable.getUrl(context, urlOpts),
            playable.loadQueueAround(context),
        ]);

        const media: ICastInfo = {
            contentType: chromecastCapabilities.effectiveMime(playable.contentType),
            currentTime,
            customData: {
                startTimeAbsolute: opts.currentTime,
            },
            metadata,
            url,
        };

        const indexOfMediaInQueue = mediaAround.findIndex(m => m.id === playable.media.id);
        const queueAround: ICastInfo[] = mediaAround.map((m, index) => {

            // NOTE: copy seriesTitle from the base metadata;
            // if there *is* any, that one should have it
            const myMetadata = {
                seriesTitle: metadata.seriesTitle,
                title: m.title,
            };

            const myUrl = indexOfMediaInQueue === index
                ? url
                : withQuery(url, { queueIndex: index });

            return {
                contentType: media.contentType, // guess?
                customData: {
                    queueIndex: index,
                },
                metadata: myMetadata,
                url: myUrl,
            };
        });

        return app.load({
            media,
            queueAround,

            onPlayerPaused: opts.onPlayerPaused,
        });
    }
}

function pickAppTypeFor(playable: IPlayable) {
    if (!chromecastCapabilities.canPlayMime(playable.contentType)) {
        // use Shougun app to support seeking within transcoded videos
        return ShougunPlayerApp;
    }

    // use the default app
    return DefaultMediaReceiverApp;
}
