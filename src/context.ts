import { IDiscovery } from "./discover/base";
import { IMediaMap, ISeries, isSeries } from "./model";
import { IPlayer } from "./playback/player";
import { IServer } from "./playback/serve";
import { ITracker} from "./track/base";

export class Context {
    constructor(
        public readonly discovery: IDiscovery,
        public readonly player: IPlayer,
        public readonly tracker: ITracker,
        public readonly server: IServer,
        private readonly knownMedia: IMediaMap,
    ) {}

    public async getSeries(seriesId: string): Promise<ISeries | undefined> {
        const media = this.knownMedia[seriesId];
        if (!isSeries(media)) {
            throw new Error(`${seriesId} is not a series!`);
        }

        return media;
    }
}
