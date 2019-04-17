
import { IPlayable } from "../model";

export interface IPlaybackOptions {
    currentTime?: number;
}

export interface IPlayer {
    play(
        playable: IPlayable,
        options?: IPlaybackOptions,
    ): Promise<void>;
}
