import _debug from "debug";

import { BaseApp, IMediaStatus, PlaybackTracker } from "babbling";

import { GenericMediaReceiverApp, ILoadParams } from "./generic";

import { IMedia } from "../../../model";

const debug = _debug("shougun:chromecast:tracker");

export class ShougunPlaybackTracker extends PlaybackTracker {
    private currentMedia: IMedia;

    constructor(
        private appInstance: BaseApp,
        private readonly params: ILoadParams,
    ) {
        super(appInstance, {
            onPlayerPaused: (currentTimeSeconds: number) =>
                this.handlePlayerPaused(currentTimeSeconds),
        });

        this.currentMedia = this.params.media.source;
        debug("new tracker:", this.params);
    }

    protected async handleClose() {
        await super.handleClose();
        if (this.appInstance instanceof GenericMediaReceiverApp) {
            this.appInstance.close();
        }
        if (this.params.onPlayerStop) {
            this.params.onPlayerStop();
        }
    }

    protected async handleMediaStatus(status: IMediaStatus) {
        super.handleMediaStatus(status);

        debug("mediaStatus=", status);
        switch (status.playerState) {
            case "PLAYING":
                this.handlePlaying(status);
                break;

            case "IDLE":
                if ((status as any).idleReason === "CANCELLED") {
                    this.handleClose();
                }
        }
    }

    private handlePlaying(status: IMediaStatus) {
        const { media } = status as any;
        if (!media) return;

        // change of current media
        const newId: string = media.contentId;
        if (this.params.media.id === newId) {
            // easy case
            this.updateCurrentMedia(
                this.params.media.source,
                status.currentTime,
            );
            return;
        }

        if (!this.params.queueAround) {
            debug("no queue; don't change currentMedia");
            return;
        }

        for (const queueItem of this.params.queueAround) {
            if (queueItem.id === newId) {
                // found it!
                this.updateCurrentMedia(queueItem.source, status.currentTime);
                return;
            }
        }

        debug("no match for", newId, "in", this.params);
    }

    private updateCurrentMedia(media: IMedia, currentTime: number | undefined) {
        if (media.id === this.currentMedia.id) {
            debug("media updated to same id");
            return;
        }

        debug("new media <-", media);
        this.currentMedia = media;

        // trigger update on media change
        this.handlePlayerPaused(currentTime || 0);
    }

    private async handlePlayerPaused(currentTimeSeconds: number) {
        if (this.params.onPlayerPaused) {
            debug(
                "dispatch paused:",
                this.currentMedia.title,
                "@",
                currentTimeSeconds,
            );
            this.params.onPlayerPaused(this.currentMedia, currentTimeSeconds);
        }
    }
}
