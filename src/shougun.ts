import _debug from "debug";
const debug = _debug("shougun:core");

import leven from "leven";

import { Context } from "./context";
import { IDiscovery } from "./discover/base";
import { IMedia, IMediaMap, isSeries } from "./model";
import { IPlaybackOptions, IPlayer } from "./playback/player";
import { Server } from "./playback/serve";
import { ITracker } from "./track/base";

export class Shougun {
    public static async create(
        discovery: IDiscovery,
        player: IPlayer,
        tracker: ITracker,
    ) {
        const map: IMediaMap = {};
        for await (const media of discovery.discover()) {
            map[media.id] = media;
        }

        const context = new Context(
            discovery,
            player,
            tracker,
            new Server(),
            map,
        );

        return new Shougun(
            context,
            map,
        );
    }

    constructor(
        public readonly context: Context,
        private readonly mediaById: IMediaMap,
    ) {}

    /**
     * Find a Series or Movie by title
     */
    public async findMedia(query: string) {
        const target = query.toLowerCase();
        const parts = target
            .split(/[ ]+/)
            .filter(part => part.length > 3);

        let best: IMedia | undefined;
        let bestScore = -1;

        for (const m of Object.values(this.mediaById)) {
            const candidate = m.title.toLowerCase();
            if (!parts.some(p => candidate.includes(p))) {
                continue;
            }

            const distance = leven(
                candidate,
                target,
            );
            if (distance === 0) {
                // probably a safe bet?
                return m;
            }

            const score = 1 / distance;
            if (score > bestScore) {
                bestScore = score;
                best = m;
            }
        }

        return best;
    }

    public async play(
        media: IMedia,
        options: IPlaybackOptions = {},
    ) {
        if (isSeries(media) || options.currentTime === undefined) {
            const track = await this.context.tracker.pickResumeForMedia(media);
            media = track.media;
            options.currentTime = track.resumeTimeSeconds;
            debug(`resuming ${media.title} with ${media.id} @${options.currentTime}`);
        }

        debug(`create playable for ${media.id}...`);
        const playable = await this.context.discovery.createPlayable(
            this.context,
            media,
        );

        debug(`playing ${media.id} as ${playable.id}...`);
        return this.context.player.play(this.context, playable, Object.assign({
            onPlayerPaused: async (currentTimeSeconds: number) => {
                return this.context.tracker.saveTrack(
                    media,
                    currentTimeSeconds,
                    playable.durationSeconds,
                );
            },
        }, options));
    }
}
