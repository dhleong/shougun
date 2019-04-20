import { ChromecastDevice } from "babbling";

import { Context } from "../../context";
import { IPlayable } from "../../model";
import { IPlaybackOptions, IPlayer } from "../player";
import { DefaultMediaReceiverApp } from "./apps/default";

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
        const [ app, metadata, url ] = await Promise.all([
            this.device.openApp(DefaultMediaReceiverApp),
            playable.getMetadata(context),
            playable.getUrl(urlOpts),
        ]);

        return app.load({
            contentType: playable.contentType,
            currentTime,
            metadata,
            url,

            onPlayerPaused: opts.onPlayerPaused,
        });
    }
}
