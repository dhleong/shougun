import { IMedia } from "../model";

export type DiscoveryId = string;

export interface IDiscovery {
    id: DiscoveryId;

    discover(): AsyncIterable<IMedia>;
}
