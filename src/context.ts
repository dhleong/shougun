import _debug from "debug";
const debug = _debug("shougun:context");

import { ChangeType, IDiscovery } from "./discover/base";
import { IMatcher } from "./match";
import { IMedia, IMediaMap, ISeries, isSeries } from "./model";
import { IPlayer } from "./playback/player";
import { IServer } from "./playback/serve";
import { ITracker} from "./track/base";

export class Context {
    constructor(
        public readonly discovery: IDiscovery,
        public readonly matcher: IMatcher,
        public readonly player: IPlayer,
        public readonly tracker: ITracker,
        public readonly server: IServer,
        private readonly knownMedia: IMediaMap,
    ) {
        trackMediaChanges(discovery, knownMedia);
    }

    /**
     * Returns an iterable for all known Titles, IE Movies or Series.
     * This should never return episodes
     */
    public async allTitles(): Promise<Iterable<IMedia>> {
        return Object.values(this.knownMedia);
    }

    public async getSeries(seriesId: string): Promise<ISeries | undefined> {
        const media = this.knownMedia[seriesId];
        if (!isSeries(media)) {
            throw new Error(`${seriesId} is not a series!`);
        }

        return media;
    }
}

function trackMediaChanges(discovery: IDiscovery, knownMedia: IMediaMap) {
    (async () => {
        for await (const change of discovery.changes()) {
            debug("received change", change);

            if (change.type === ChangeType.MEDIA_REMOVED) {
                delete knownMedia[change.media.id];
            } else {
                knownMedia[change.media.id] = change.media;
            }
        }
    })().catch(e => {
        throw new Error("Error encountered tracking media changes:\nCaused by:" + e.stack);
    });
}
