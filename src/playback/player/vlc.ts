import _debug from "debug";
const debug = _debug("shougun:player:vlc");

import Vlc from "vlc-simple-player";

import { Context } from "../../context";
import { IAudioTrack, IVideoTrack } from "../../media/analyze";
import { IPlayable } from "../../model";
import { IPlaybackOptions, IPlayer, IPlayerCapabilities } from "../player";

export class VlcPlayer implements IPlayer {
    public async getCapabilities(): Promise<IPlayerCapabilities> {
        return {
            supportsAudioTrack: (track: IAudioTrack) => true,
            supportsContainer: (container: string) => true,
            supportsVideoTrack: (track: IVideoTrack) => true,

            supportsLocalPlayback: true,
        };
    }

    public async play(
        context: Context,
        playable: IPlayable,
        options: IPlaybackOptions = {},
    ) {
        const path = await playable.getUrl(context, options);

        const args: string[] = [
            "--fullscreen", "--no-video-title",
        ];
        if (options.currentTime !== undefined) {
            args.push("--start-time", "" + options.currentTime);
        }

        const vlc = new Vlc(path, {
            arguments: args,
        });

        let lastTimestamp: number = -1;
        function tryReportProgress() {
            if (
                options.onPlayerPaused
                && lastTimestamp >= 0
            ) {
                options.onPlayerPaused(playable.media, lastTimestamp);
            }
        }

        function handleVlcProcessClose() {
            // NOTE: the library adds a close() listener that kills
            // this whole process. Can't have that.
            vlc.process.removeAllListeners("close");

            vlc.process.on("close", () => {
                debug("process closed; report progress");

                // HACKS: the library does not clean this up :/
                // At some point maybe we just write our own
                clearInterval(vlc._interval);
                tryReportProgress();
            });
        }

        vlc.on("statuschange", (e, status) => {
            if (status && status.time >= 0) {
                if (lastTimestamp === -1) {
                    // NOTE: the vlc library *also* starts asynchronously
                    // within the constructor, so we have to wait until
                    // we get some event to handle process management
                    handleVlcProcessClose();
                }

                lastTimestamp = status.time;
            }

            if (!status || status.state === "paused") {
                tryReportProgress();
            }
        });
    }

}
