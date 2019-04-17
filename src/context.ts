import { IDiscovery } from "./discover/base";
import { IServer } from "./playback/serve";

export class Context {
    constructor(
        public readonly discovery: IDiscovery,
        public readonly server: IServer,
    ) {}
}
