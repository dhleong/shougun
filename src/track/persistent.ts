import {
    IEpisode,
    IMedia,
    isEpisode,
    ISeries,
    isSeries,
    IMediaPrefs,
} from "../model";
import {
    ILoanCreate,
    ILoanData,
    ILoanTracker,
    ITrack,
    ITracker,
    IPrefsTracker,
} from "./base";
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

export const DEFAULT_RECENTS_LIMIT = 20;

export interface IQueryRecentOpts {
    external?: "include" | "exclude" | "only";
    limit?: number;
}

export interface IStorage extends ILoanTracker, IPrefsTracker {
    close(): void;
    loadById(id: string): Promise<IViewedInformation | null>;
    loadLastViewedForSeries(
        seriesId: string,
    ): Promise<IViewedInformation | null>;
    queryRecent(opts?: { limit?: number }): AsyncIterable<IViewedInformation>;
    save(info: IViewedInformation): Promise<void>;
}

export function watchStateOf(viewedInfo: IViewedInformation) {
    return computeWatchState(
        viewedInfo.resumeTimeSeconds,
        viewedInfo.videoDurationSeconds,
    );
}

export class PersistentTracker implements ITracker {
    constructor(private readonly storage: IStorage) {}

    public createLoan(track: ILoanCreate): Promise<void> {
        return this.storage.createLoan(track);
    }

    public markBorrowReturned(tokens: string[]): Promise<void> {
        return this.storage.markBorrowReturned(tokens);
    }

    public retrieveBorrowed(): Promise<ILoanData> {
        return this.storage.retrieveBorrowed();
    }

    public returnBorrowed(
        tokens: string[],
        viewedInformation: IViewedInformation[],
    ): Promise<void> {
        return this.storage.returnBorrowed(tokens, viewedInformation);
    }

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

        const state = watchStateOf(lastWatched);
        switch (state) {
            case WatchState.Unwatched:
                // unwatched? also start at beginning
                return this.trackForEpisode(media, lastWatched);

            case WatchState.InProgress: {
                // resume in-progress episode
                const track = await this.trackForEpisode(media, lastWatched);
                return {
                    resumeTimeSeconds: lastWatched.resumeTimeSeconds,
                    ...track,
                };
            }

            case WatchState.Watched:
                // watch "next" episode of the series!
                return this.trackForNextEpisodeAfter(media, lastWatched);
        }
    }

    public async *queryRecent(opts: IQueryRecentOpts = {}) {
        yield* this.storage.queryRecent(opts);
    }

    public async saveTrack(
        media: IMedia,
        resumeTimeSeconds: number,
        videoDurationSeconds: number,
    ): Promise<void> {
        const seriesId = isEpisode(media) ? media.seriesId : undefined;
        const { title } = media;

        const info: IViewedInformation = {
            id: media.id,
            seriesId,
            title,

            lastViewedTimestamp: Date.now(),
            resumeTimeSeconds,
            videoDurationSeconds,
        };

        await this.storage.save(info);
    }

    public async loadPrefsForSeries(seriesId: string) {
        return this.storage.loadPrefsForSeries(seriesId);
    }

    public async updatePrefsForSeries(seriesId: string, prefs: IMediaPrefs) {
        return this.storage.updatePrefsForSeries(seriesId, prefs);
    }

    public async deletePrefsForSeries(seriesId: string) {
        return this.storage.deletePrefsForSeries(seriesId);
    }

    private async trackForFirstEpisodeOf(series: ISeries): Promise<ITrack> {
        return { media: series.seasons[0].episodes[0] };
    }

    private async trackForEpisode(
        series: ISeries,
        lastWatched: IViewedInformation,
    ): Promise<ITrack> {
        // NOTE: there's a more optimized path possible here,
        // but keeping a single implementation is simpler in
        // case we decide to refactor so Series containing all
        // of its episodes isn't guaranteed...
        return this.trackForEpisodeRelativeTo(
            series,
            lastWatched,
            0, // exact match
        );
    }

    private async trackForNextEpisodeAfter(
        series: ISeries,
        lastWatched: IViewedInformation,
    ): Promise<ITrack> {
        return this.trackForEpisodeRelativeTo(
            series,
            lastWatched,
            1, // the next episode
        );
    }

    private async trackForEpisodeRelativeTo(
        series: ISeries,
        lastWatched: IViewedInformation,
        delta: number,
    ): Promise<ITrack> {
        // this is not ideal, but it will never be more than
        // a few hundred, so this is simple and fine for now...
        const episodes = series.seasons.reduce((result, s) => {
            result.push(...s.episodes);
            return result;
        }, [] as IEpisode[]);

        const idx = episodes.findIndex((ep) => ep.id === lastWatched.id);
        if (idx === -1) {
            throw new Error(
                `Couldn't find last-watched episode ${lastWatched.title}`,
            );
        }

        const interestedIndex = idx + delta;
        if (interestedIndex >= episodes.length) {
            // wrap around
            return this.trackForFirstEpisodeOf(series);
        }

        return { media: episodes[interestedIndex] };
    }

    private trackOf(media: IMedia, info: IViewedInformation) {
        return {
            media,
            resumeTimeSeconds: info.resumeTimeSeconds,
        };
    }
}
