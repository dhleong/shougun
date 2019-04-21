import _debug from "debug";
const debug = _debug("shougun:core");

import { Context } from "./context";
import { IDiscovery } from "./discover/base";
import { IMatcher } from "./match";
import { IMedia, IMediaMap, isSeries } from "./model";
import { IPlaybackOptions, IPlayer } from "./playback/player";
import { Server } from "./playback/serve";
import { ITracker } from "./track/base";

export class Shougun {
    public static async create(
        discovery: IDiscovery,
        matcher: IMatcher,
        player: IPlayer,
        tracker: ITracker,
    ) {
        const map: IMediaMap = {};
        for await (const media of discovery.discover()) {
            map[media.id] = media;
        }

        const context = new Context(
            discovery,
            matcher,
            player,
            tracker,
            new Server(),
            map,
        );

        return new Shougun(
            context,
        );
    }

    constructor(
        public readonly context: Context,
    ) {}

    /**
     * Find a Series or Movie by title
     */
    public async findMedia(query: string) {
        const titles = await this.context.allTitles();
        return this.context.matcher.findBest(query, titles, (media: IMedia) =>
            media.title,
        );
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
        await this.context.player.play(this.context, playable, Object.assign({
            onPlayerPaused: async (currentTimeSeconds: number) => {
                return this.context.tracker.saveTrack(
                    media,
                    currentTimeSeconds,
                    playable.durationSeconds,
                );
            },
        }, options));

        return media;
    }
}
