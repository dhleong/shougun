import { ChromecastDevice } from "babbling";

import { IPlayable } from "../model";
import { DefaultMediaReceiverApp } from "./apps/default";

export class Player {
    constructor(
        private device: ChromecastDevice,
    ) { }

    public async play(
        playable: IPlayable,
        opts: {
            currentTime?: number,
        } = {},
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
        });
    }
}
