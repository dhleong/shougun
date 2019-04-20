import { IEpisode, IMedia, isEpisode, ISeries, isSeries } from "../model";
import { ITrack, ITracker } from "./base";
import { computeWatchState, WatchState } from "./util";

export interface IViewedInformation {
    id: string;

    seriesId?: string;
    title: string;

    /** Unix time in millis */
    lastViewedTimestamp: number;
    resumeTimeSeconds: number;
    videoDurationSeconds: number;
}

export interface IStorage {
    loadById(id: string): Promise<IViewedInformation | null>;
    loadLastViewedForSeries(seriesId: string): Promise<IViewedInformation | null>;
    save(info: IViewedInformation): Promise<void>;
}

export function watchStateOf(viewedInfo: IViewedInformation) {
    return computeWatchState(
        viewedInfo.resumeTimeSeconds,
        viewedInfo.videoDurationSeconds,
    );
}

export class PersistentTracker implements ITracker {

    constructor(
        private readonly storage: IStorage,
    ) {}

    public async pickResumeForMedia(media: IMedia): Promise<ITrack> {
        if (!isSeries(media)) {
            const info = await this.storage.loadById(media.id);
            if (!info) return { media };

            if (watchStateOf(info) === WatchState.InProgress) {
                return this.trackOf(media, info);
            }

            // start from the beginning
            return { media };
        }

        const lastWatched = await this.storage.loadLastViewedForSeries(
            media.id,
        );
        if (!lastWatched) {
            // no existing track? start from the beginning
            return this.trackForFirstEpisodeOf(media);
        }

        // resume in-progress episode
        if (watchStateOf(lastWatched) === WatchState.InProgress) {
            return this.trackOf(media, lastWatched);
        }

        // watch "next" episode of the series!
        return this.trackForNextEpisodeAfter(media, lastWatched);
    }

    public async saveTrack(
        media: IMedia,
        resumeTimeSeconds: number,
        videoDurationSeconds: number,
    ): Promise<void> {
        const seriesId = isEpisode(media)
            ? media.seriesId
            : undefined;
        const { title } = media;

        await this.storage.save({
            id: media.id,
            seriesId,
            title,

            lastViewedTimestamp: Date.now(),
            resumeTimeSeconds,
            videoDurationSeconds,
        } as IViewedInformation);
    }

    private async trackForFirstEpisodeOf(series: ISeries): Promise<ITrack> {
        return { media: series.seasons[0].episodes[0] };
    }

    private async trackForNextEpisodeAfter(
        series: ISeries,
        lastWatched: IViewedInformation,
    ): Promise<ITrack> {

        // this is not ideal, but it will never be more than
        // a few hundred, so this is simple and fine for now...
        const episodes = series.seasons.reduce((result, s) => {
            result.push(...s.episodes);
            return result;
        }, [] as IEpisode[]);

        const idx = episodes.findIndex(ep => ep.id === lastWatched.id);
        if (idx === -1) {
            throw new Error(`Couldn't find last-watched episode ${lastWatched.title}`);
        }

        const nextIndex = idx + 1;
        if (nextIndex >= episodes.length) {
            // wrap around
            return this.trackForFirstEpisodeOf(series);
        }

        return { media: episodes[nextIndex] };
    }

    private trackOf(
        media: IMedia,
        info: IViewedInformation,
    ) {
        return {
            media,
            resumeTimeSeconds: info.resumeTimeSeconds,
        };
    }
}
