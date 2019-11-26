import { Context } from "../../context";
import { IPlayable } from "../../model";
import { IPlaybackOptions, IPlayer, IPlayerCapabilities } from "../player";

export class VlcPlayer implements IPlayer {
    public async getCapabilities(): Promise<IPlayerCapabilities> {
        throw new Error("Method not implemented.");
    }

    public async play(context: Context, playable: IPlayable, options?: IPlaybackOptions) {
        // const media = playable.media as ILocalMedia;
        // console.log(media);
        // TODO
    }

}
