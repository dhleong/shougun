import { IDiscovery } from "./discover/base";
import { IPlayer } from "./playback/player";
import { IServer } from "./playback/serve";
import { ITracker } from "./track/base";

export class Context {
    constructor(
        public readonly discovery: IDiscovery,
        public readonly player: IPlayer,
        public readonly tracker: ITracker,
        public readonly server: IServer,
    ) {}
}
