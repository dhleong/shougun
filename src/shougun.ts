import leven from "leven";

import { Context } from "./context";
import { IDiscovery } from "./discover/base";
import { IMedia, IMediaMap } from "./model";
import { IPlaybackOptions, IPlayer } from "./playback/player";
import { Server } from "./playback/serve";

export class Shougun {
    public static async create(
        discovery: IDiscovery,
        player: IPlayer,
    ) {
        const map: IMediaMap = {};
        for await (const media of discovery.discover()) {
            map[media.id] = media;
        }

        const context = new Context(
            discovery,
            player,
            new Server(),
        );

        return new Shougun(
            context,
            map,
        );
    }

    constructor(
        private context: Context,
        private mediaById: IMediaMap,
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
        options: IPlaybackOptions,
    ) {
        const discovery = this.context.discovery.instanceById(
            media.discovery,
        );
        if (!discovery) {
            throw new Error(
                `${media.id} discovered by unknown: ${media.discovery}`,
            );
        }

        // TODO pick the right episode in a Series

        const playable = await discovery.createPlayable(
            this.context,
            media,
        );

        return this.context.player.play(playable, options);
    }
}
