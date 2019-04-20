
import { Context } from "../context";
import { IPlayable } from "../model";

export interface IPlaybackOptions {
    /**
     * In *seconds*
     */
    currentTime?: number;

    /**
     * Callback to be notified of the User's playback time,
     * in seconds.
     */
    onPlayerPaused?: (currentTimeSeconds: number) => Promise<void>;
}

export interface IPlayer {
    play(
        context: Context,
        playable: IPlayable,
        options?: IPlaybackOptions,
    ): Promise<void>;
}
