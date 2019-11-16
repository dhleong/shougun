import _debug from "debug";
const debug = _debug("shougun:player:chromecast");

import { ChromecastDevice } from "babbling";

import { Context } from "../../context";
import { IAudioTrack, IVideoAnalysis, IVideoTrack } from "../../media/analyze";
import { getMetadata } from "../../media/metadata";
import { IMedia, IPlayable, MediaType } from "../../model";
import { withQuery } from "../../util/url";
import { canPlayNatively, IPlaybackOptions, IPlayer, IPlayerCapabilities } from "../player";
import { DefaultMediaReceiverApp } from "./apps/default";
import { ICastInfo } from "./apps/generic";
import { IRecommendation, ShougunPlayerApp } from "./apps/shougun-player";

const chromecastCapabilities = {
    canShowRecommendations: true,

    supportedMimes: new Set<string>([
        "video/mp4", "video/webm", "video/x-matroska",
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

const ultraCapabilities = {
    ...chromecastCapabilities,

    audioCodecs: new Set([
        "aac",
        "ac3",
        "eac3",
        "flac",
        "mp3",
        "opus",
        "wav",
        "vorbis",
    ]),

    // NOTE: chromecast supports matroska and webm containers, but doesn't
    // seem to properly support seeking within them, so we just do a
    // passthrough transcode and use shougun-cast-player to handle seeking
    containers: new Set([
        "mp4",
        "matroska",
        "webm",
    ]),

    supportsAudioTrack(track: IAudioTrack) {
        return this.audioCodecs.has(track.codec);
    },

    supportsPixelFormat(format: string) {
        // not documented, but discovered experimentally, with thanks
        // for the hint to: https://github.com/petrkotek/chromecastize
        return !format.includes("yuv444");
    },

    supportsVideoTrack(track: IVideoTrack) {
        switch (track.codec) {
        case "vp8":
            return true;

        case "vp9":
            if (
                track.profile
                && !track.profile.includes("0")
                && !track.profile.includes("2")
            ) {
                // unsupported profile
                return false;
            }
            if ((track.fps || 24) > 60) return false;
            return true;

        case "h264":
            if ((track.level || 0) > 52) return false;
            if ((track.fps || 24) > 30) return false;
            return true;

        case "hevc":
            if ((track.fps || 24) > 60) return false;
            if (
                track.profile !== "Main"
                && track.profile !== "Main 10"
            ) return false;

            return true;

        default:
            return false;
        }
    },

    supportsContainer(container: string) {
        return this.containers.has(container);
    },
};

export class ChromecastPlayer implements IPlayer {
    public static forNamedDevice(deviceName: string) {
        return new ChromecastPlayer(new ChromecastDevice(deviceName));
    }

    constructor(
        private device: ChromecastDevice,
    ) { }

    public async getCapabilities(): Promise<IPlayerCapabilities> {
        // TODO figure out the actual device type
        return ultraCapabilities;
    }

    public async play(
        context: Context,
        playable: IPlayable,
        opts: IPlaybackOptions = {},
    ) {
        let urlOpts: IPlaybackOptions | undefined;

        const [ analysis, capabilities ] = await Promise.all([
            playable.analyze ? playable.analyze() : Promise.resolve(null),
            this.getCapabilities(),
        ]);

        let contentType = playable.contentType;
        let currentTime = opts.currentTime;
        if (!currentTime) {
            currentTime = 0;
        } else if (!canPlayNatively(capabilities, analysis)) {
            // this content cannot be streamed to Chromecast,
            // so we *cannot* provide currentTime, and instead
            // should pass it to getUrl()
            // FIXME: if we use ShougunPlayerApp, *can we* actually send
            // currentTime?
            urlOpts = { currentTime };
            currentTime = 0;
            contentType = "video/mp4"; // we'll be transcoding
        }

        const appType = pickAppTypeFor(capabilities, analysis);
        const [
            app, metadata, url, coverUrl, mediaAround,
        ] = await Promise.all([
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
            contentType: chromecastCapabilities.effectiveMime(contentType),
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
        context: Context,
        recommendations: Promise<IMedia[]>,
    ) {
        const [ app, media ] = await Promise.all([
            this.device.openApp(ShougunPlayerApp),
            recommendations,
        ]);

        const formattedRecommendations = await Promise.all(media.map(async m => {
            let cover = (m as any).cover;
            if (!cover && m.type !== MediaType.ExternalPlayable) {
                // to get a cover for local media, we need to get a
                // Playable of it, first
                try {
                    const p = await context.discovery.createPlayable(context, m);
                    if (p.getCoverUrl) {
                        cover = await p.getCoverUrl(context);
                    }
                } catch (e) {
                    // ignore
                    debug("error preparing cover url for", m, " = ", e);
                }
            }
            return {
                cover,
                id: m.id,
                title: m.title,
            } as IRecommendation;
        }));

        return app.showRecommendations(formattedRecommendations);
    }
}

function pickAppTypeFor(
    capabilities: IPlayerCapabilities,
    analysis: IVideoAnalysis | null,
) {
    if (!canPlayNatively(capabilities, analysis)) {
        // use Shougun app to support seeking within transcoded videos
        return ShougunPlayerApp;
    }

    // use the default media receiver app, otherwise
    return DefaultMediaReceiverApp;
}
