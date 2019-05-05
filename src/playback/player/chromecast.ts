import { ChromecastDevice } from "babbling";

import { Context } from "../../context";
import { getMetadata } from "../../media/metadata";
import { IPlayable } from "../../model";
import { withQuery } from "../../util/url";
import { IPlaybackOptions, IPlayer } from "../player";
import { DefaultMediaReceiverApp, ICastInfo } from "./apps/default";

export class ChromecastPlayer implements IPlayer {
    public static forNamedDevice(deviceName: string) {
        return new ChromecastPlayer(new ChromecastDevice(deviceName));
    }

    constructor(
        private device: ChromecastDevice,
    ) { }

    public async play(
        context: Context,
        playable: IPlayable,
        opts: IPlaybackOptions = {},
    ) {
        let urlOpts: IPlaybackOptions | undefined;

        let currentTime = opts.currentTime;
        if (!currentTime) {
            currentTime = 0;
        } else if (playable.contentType !== "video/mp4") {
            // this content cannot be streamed to Chromecast,
            // so we *cannot* provide currentTime, and instead
            // should pass it to getUrl()
            urlOpts = { currentTime };
            currentTime = 0;
        }

        // TODO pick app?
        const [ app, metadata, url, mediaAround ] = await Promise.all([
            this.device.openApp(DefaultMediaReceiverApp),
            getMetadata(context, playable.media),
            playable.getUrl(context, urlOpts),
            playable.loadQueueAround(context),
        ]);

        const media: ICastInfo = {
            contentType: playable.contentType,
            currentTime,
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
                contentType: playable.contentType, // guess?
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
