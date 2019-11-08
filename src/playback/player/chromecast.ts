import { ChromecastDevice } from "babbling";

import { Context } from "../../context";
import { getMetadata } from "../../media/metadata";
import { IMedia, IPlayable } from "../../model";
import { withQuery } from "../../util/url";
import { IPlaybackOptions, IPlayer, IPlayerCapabilities } from "../player";
import { DefaultMediaReceiverApp } from "./apps/default";
import { ICastInfo } from "./apps/generic";
import { IRecommendation, ShougunPlayerApp } from "./apps/shougun-player";

const chromecastCapabilities = {
    canShowRecommendations: true,

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
        const [ app, metadata, url, coverUrl, mediaAround ] = await Promise.all([
            this.device.openApp(appType),
            getMetadata(context, playable.media),
            playable.getUrl(context, urlOpts),
            playable.getCoverUrl
                ? playable.getCoverUrl(context)
                : Promise.resolve(undefined),
            playable.loadQueueAround(context),
        ]);

        metadata.coverUrl = coverUrl;

        const media: ICastInfo = {
            contentType: chromecastCapabilities.effectiveMime(playable.contentType),
            currentTime,
            customData: {
                durationSeconds: playable.durationSeconds,
                startTimeAbsolute: opts.currentTime,
            },
            duration: playable.durationSeconds,
            id: playable.id,
            metadata,
            source: playable.media,
            url,
        };

        const indexOfMediaInQueue = mediaAround.findIndex(m => m.id === playable.media.id);
        const queueAround: ICastInfo[] = mediaAround.map((m, index) => {

            // NOTE: copy base metadata; if there *is* a seriesTitle, for
            // example, that one should have it
            const myMetadata = Object.assign({}, metadata, {
                title: m.title,
            });

            const myUrl = indexOfMediaInQueue === index
                ? url
                : withQuery(url, { queueIndex: index });

            return {
                contentType: media.contentType, // guess?
                customData: {
                    queueIndex: index,
                },
                id: m.id,
                metadata: myMetadata,
                source: m,
                url: myUrl,
            };
        });

        return app.load({
            media,
            queueAround,

            onPlayerPaused: opts.onPlayerPaused,
        });
    }

    public async showRecommendations(
        recommendations: Promise<IMedia[]>,
    ) {
        const [ app, media ] = await Promise.all([
            this.device.openApp(ShougunPlayerApp),
            recommendations,
        ]);

        const formattedRecommendations = media.map(m => {
            // FIXME: to get a cover for local media, we need to get a
            // Playable of it, first
            return {
                cover: (m as any).cover,
                id: m.id,
                title: m.title,
            } as IRecommendation;
        });

        return app.showRecommendations(formattedRecommendations);
    }
}

function pickAppTypeFor(playable: IPlayable) {
    if (!chromecastCapabilities.canPlayMime(playable.contentType)) {
        // use Shougun app to support seeking within transcoded videos
        return ShougunPlayerApp;
    }

    // use the default media receiver app, otherwise
    return DefaultMediaReceiverApp;
}
