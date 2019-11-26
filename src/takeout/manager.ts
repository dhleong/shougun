import { ISeries, isSeries } from "../model";
import { DummyPlayer } from "../playback/player/dummy";
import { Shougun } from "../shougun";
import { ITrack } from "../track/base";
import { IViewedInformation } from "../track/persistent";

import { ITakeoutRequest } from "./model";

export class TakeoutManager {
    constructor(
        private shougun: Shougun,
    ) {}

    /**
     * Request URLs and other data to capture a snapshot of local
     * media for playback on the local machine. This is sort of a
     * poor man's sync
     */
    public async takeout(
        requests: ITakeoutRequest[],
    ) {
        const { context } = this.shougun;
        const responses = await Promise.all(requests.map(async req => {
            const media = await context.getMediaById(req.seriesId);
            if (!media) return;

            const resume = await context.tracker.pickResumeForMedia(media);
            const episodes = [resume];
            if (isSeries(media)) {
                addNextEpisodes(episodes, media, resume, req.episodes - 1);
            }

            // create a dummy Context so we receive the original
            // media without any transcoding
            const dummyContext = context.withPlayer(new DummyPlayer());
            return Promise.all(episodes.map(async e => {
                const p = await context.discovery.createPlayable(context, e.media);
                return {
                    ...e,
                    url: await p.getUrl(dummyContext),
                };
            }));
        }));

        // TODO create a takeout token
        return {
            media: responses,
        };
    }

    /**
     * Save viewed information encountered during a takeout request.
     */
    public async returnTakeout(
        token: string,
        viewedInformation: IViewedInformation[],
    ) {
        // TODO
    }
}

function addNextEpisodes(
    episodes: ITrack[],
    media: ISeries,
    resume: ITrack,
    requested: number,
) {
    let remainingCount = requested;
    let foundResume = false;
    for (const s of media.seasons) {
        for (const e of s.episodes) {
            if (foundResume && remainingCount-- > 0) {
                episodes.push({ media: e });
            } else if (!foundResume && e.id === resume.media.id) {
                foundResume = true;
            }

            if (remainingCount <= 0) break;
        }

        if (remainingCount <= 0) break;
    }
}
