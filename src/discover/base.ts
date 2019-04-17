import { Context } from "../context";
import { IMedia, IPlayable } from "../model";

export type DiscoveryId = string;

export interface IDiscovery {
    id: DiscoveryId;

    createPlayable(context: Context, media: IMedia): Promise<IPlayable>;
    discover(): AsyncIterable<IMedia>;
    instanceById(id: DiscoveryId): IDiscovery | undefined;
}
