import { IMedia } from "../model";

export interface IDiscovery {
    discover(): AsyncIterable<IMedia>;
}
