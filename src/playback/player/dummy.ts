import { Context } from "../../context";
import { IAudioTrack, IVideoTrack } from "../../media/analyze";
import { IPlayable } from "../../model";
import { IPlaybackOptions, IPlayer, IPlayerCapabilities } from "../player";

export class DummyPlayer implements IPlayer {
    public async getCapabilities(): Promise<IPlayerCapabilities> {
        return {
            supportsAudioTrack: (_track: IAudioTrack) => true,
            supportsVideoTrack: (_track: IVideoTrack) => true,

            supportsContainer: (_container: string) => true,
            supportsPixelFormat: (_format: string) => true,
        };
    }

    public async play(
        _context: Context,
        _playable: IPlayable,
        _options?: IPlaybackOptions,
    ): Promise<void> {
        throw new Error("Method not implemented.");
    }
}
