
import { Context } from "../context";
import { IMedia, IPlayable } from "../model";

export interface IPlaybackOptions {
    /**
     * In *seconds*
     */
    currentTime?: number;

    /**
     * Callback to be notified of the User's playback time,
     * in seconds.
     */
    onPlayerPaused?: (
        media: IMedia,
        currentTimeSeconds: number,
    ) => Promise<void>;
}

export interface IPlayerCapabilities {
    canPlayMime(mime: string): boolean;
}

export interface IPlayer {
    getCapabilities(): IPlayerCapabilities;

    play(
        context: Context,
        playable: IPlayable,
        options?: IPlaybackOptions,
    ): Promise<void>;

    showRecommendations?(
        context: Context,
        recommendations: Promise<IMedia[]>,
    ): Promise<void>;
}
