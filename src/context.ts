import { IDiscovery } from "./discover/base";
import { IPlayer } from "./playback/player";
import { IServer } from "./playback/serve";

export class Context {
    constructor(
        public readonly discovery: IDiscovery,
        public readonly player: IPlayer,
        public readonly server: IServer,
    ) {}
}
