import _debug from "debug";

import { ChangeType, IDiscovery } from "./discover/base";
import { IMatcher } from "./match";
import type { IMedia, IMediaMap, IQueryable, ISeries } from "./model";
import { isSeries } from "./model";
import type { IPlayer } from "./playback/player";
import type { IServer } from "./playback/serve";
import type { ITracker } from "./track/base";

const debug = _debug("shougun:context");

export interface IShougunOpts {
    allowProcessKeepalive?: boolean;
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

function trackMediaChanges(
    context: Context,
    discovery: IDiscovery,
    knownMedia: IMediaMap,
) {
    (async () => {
        debug("tracking changes to", discovery);
        for await (const change of discovery.changes(context)) {
            debug("received change", change);

            /* eslint-disable no-param-reassign */
            if (change.type === ChangeType.MEDIA_REMOVED) {
                delete knownMedia[change.media.id];
            } else {
                knownMedia[change.media.id] = change.media;
            }
            /* eslint-enable no-param-reassign */
        }
    })().catch((e) => {
        throw new Error(
            `Error encountered tracking media changes:\nCaused by:${e.stack}`,
        );
    });
}

export class Context {
    constructor(
        public readonly queryables: IQueryable[],
        public readonly discovery: IDiscovery,
        public readonly matcher: IMatcher,
        public readonly player: IPlayer,
        public readonly tracker: ITracker,
        public readonly server: IServer,
        public readonly opts: IShougunOpts,
        private knownMedia: IMediaMap,
    ) {
        trackMediaChanges(this, discovery, knownMedia);
    }

    public async refreshKnownMedia() {
        const map: IMediaMap = {};
        for await (const media of this.discovery.discover()) {
            map[media.id] = media;
        }
        this.knownMedia = map;
        return map;
    }

    public withPlayer(newPlayer: IPlayer) {
        return new Context(
            this.queryables,
            this.discovery,
            this.matcher,
            newPlayer,
            this.tracker,
            this.server,
            this.opts,
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
