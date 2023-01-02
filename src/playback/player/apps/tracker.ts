import _debug from "debug";

import { BaseApp, IMediaStatus, PlaybackTracker } from "babbling";

import type { ILoadParams } from "./generic";

import { IMedia } from "../../../model";
import { isCloseable } from "./model";

const debug = _debug("shougun:chromecast:tracker");

export class ShougunPlaybackTracker extends PlaybackTracker {
    private currentMedia: IMedia;
    private currentMediaDuration: number | undefined;

    constructor(
        private appInstance: BaseApp,
        private readonly params: ILoadParams,
    ) {
        super(appInstance, {
            onPlayerPaused: (currentTimeSeconds: number) => {
                debug("onPlayerPaused");
                return this.handlePlayerPaused(
                    currentTimeSeconds,
                    this.currentMediaDuration,
                );
            },
        });

        this.currentMedia = this.params.media.source;
        this.currentMediaDuration = this.params.media.duration;
        debug("new tracker:", this.params);
    }

    protected async handleClose() {
        debug("handleClose");
        await super.handleClose();
        if (isCloseable(this.appInstance)) {
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
                break;

            default:
            // ignore
        }
    }

    private handlePlaying(status: IMediaStatus) {
        const { media } = status as any;
        if (!media) return;

        // change of current media
        const newId: string = media.contentId;
        if (this.currentMedia.id === newId) {
            // easy case
            this.updateCurrentMedia(
                this.currentMedia,
                status.currentTime,
                media.duration,
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
                const duration =
                    queueItem.duration ??
                    (media.contentId === newId ? media.duration : undefined);
                await this.updateCurrentMedia(
                    queueItem.source,
                    status.currentTime,
                    duration,
                );
                return;
            }
        }

        debug("no match for", newId, "in", this.params);
    }

    private async updateCurrentMedia(
        media: IMedia,
        currentTime: number | undefined,
        duration: number | undefined,
    ) {
        if (media.id === this.currentMedia.id) {
            debug("media updated to same id");
            return;
        }

        debug(`new media (${duration}s) <-`, media);
        this.currentMedia = media;
        this.currentMediaDuration = duration;

        // trigger update on media change
        await this.handlePlayerPaused(currentTime ?? 0, duration ?? 0);
    }

    private async handlePlayerPaused(
        currentTimeSeconds: number,
        durationSeconds: number | undefined,
    ) {
        if (this.params.onPlayerPaused) {
            debug(
                "dispatch paused:",
                this.currentMedia.title,
                `@ ${currentTimeSeconds} / ${durationSeconds}`,
            );
            await this.params.onPlayerPaused(
                this.currentMedia,
                currentTimeSeconds,
                durationSeconds,
            );
        }
    }
}
