import { ChromecastDevice } from "babbling";

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
        playable: IPlayable,
        opts: IPlaybackOptions = {},
    ) {
        // TODO pick app?
        const [ app, metadata, url ] = await Promise.all([
            this.device.openApp(DefaultMediaReceiverApp),
            playable.getMetadata(),
            playable.getUrl(),
        ]);

        let currentTime = opts.currentTime;
        if (!currentTime) {
            // TODO load by ID to resume
            currentTime = 0;
        }

        return app.load({
            contentType: playable.contentType,
            currentTime,
            metadata,
            url,

            onPlayerPaused: opts.onPlayerPaused,
        });
    }
}
