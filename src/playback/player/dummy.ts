import { IPlaybackOptions, IPlayer, IPlayerCapabilities } from "../player";
import { Context } from "../../context";
import { IPlayable } from "../../model";
import { IAudioTrack, IVideoTrack } from "../../media/analyze";

export class DummyPlayer implements IPlayer {
    public async getCapabilities(): Promise<IPlayerCapabilities> {
        return {
            supportsAudioTrack: (track: IAudioTrack) => true,
            supportsVideoTrack: (track: IVideoTrack) => true,
            supportsContainer: (container: string) => true,
            supportsPixelFormat: (format: string) => true,
        };
    }

    public async play(context: Context, playable: IPlayable, options?: IPlaybackOptions): Promise<void> {
        throw new Error("Method not implemented.");
    }

    showRecommendations?(context: import("../../context").Context, recommendations: Promise<import("../../model").IMedia[]>): Promise<void> {
        throw new Error("Method not implemented.");
    }

}
