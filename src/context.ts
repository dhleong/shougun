import _debug from "debug";
const debug = _debug("shougun:context");

import { ChangeType, IDiscovery } from "./discover/base";
import { IMatcher } from "./match";
import { IMedia, IMediaMap, IQueryable, ISeries, isSeries } from "./model";
import { IPlayer } from "./playback/player";
import { IServer } from "./playback/serve";
import { ITracker} from "./track/base";

export class Context {
    constructor(
        public readonly queryables: IQueryable[],
        public readonly discovery: IDiscovery,
        public readonly matcher: IMatcher,
        public readonly player: IPlayer,
        public readonly tracker: ITracker,
        public readonly server: IServer,
        private knownMedia: IMediaMap,
    ) {
        trackMediaChanges(discovery, knownMedia);
    }

    public async refreshKnownMedia() {
        const map: IMediaMap = {};
        for await (const media of this.discovery.discover()) {
            map[media.id] = media;
        }
        this.knownMedia = map;
        return map;
    }

    public withPlayer(
        newPlayer: IPlayer,
    ) {
        return new Context(
            this.queryables,
            this.discovery,
            this.matcher,
            newPlayer,
            this.tracker,
            this.server,
            this.knownMedia,
        );
    }

    /**
     * Returns an iterable for all known Titles, IE Movies or Series.
     * This should never return episodes
     */
    public async allTitles(): Promise<Iterable<IMedia>> {
        return Object.values(this.knownMedia);
    }

    public async getMediaById(id: string): Promise<IMedia | undefined> {
        const direct = this.knownMedia[id];
        if (direct) return direct;

        const seriesIdEnd = id.indexOf(":");
        if (seriesIdEnd !== -1) {
            // could be an episode ID
            const seriesId = id.substring(0, seriesIdEnd);
            const series = this.knownMedia[seriesId];
            if (series && isSeries(series)) {
                const episode = findEpisodeById(series, id);
                if (episode) return episode; // found!
            }
        }
    }

    public async getSeries(seriesId: string): Promise<ISeries | undefined> {
        const media = await this.getMediaById(seriesId);
        if (!media) return;

        if (!isSeries(media)) {
            throw new Error(`${seriesId} is not a series!`);
        }

        return media;
    }
}

function findEpisodeById(series: ISeries, id: string) {
    for (const s of series.seasons) {
        for (const e of s.episodes) {
            if (e.id === id) {
                return e;
            }
        }
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
