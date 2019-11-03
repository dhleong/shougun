import { IMedia } from "../model";

export interface ITrack {
    media: IMedia;
    resumeTimeSeconds?: number;
}

export interface IRecentMedia {
    id: string;
    seriesId?: string;
    title: string;
}

export interface ITracker {

    /**
     * Figure out what to actually play when the User requests the
     * given media.
     *
     * Given a Movie:
     *   - If we have track data and the User hasn't "finished"
     *     watching it, include the resume time in the response
     *   - Otherwise, just return the Media as-is
     *
     * Given an Episode:
     *   - See Movie logic
     *
     * Given a Series, guess which episode the User wants to play:
     *   - If there was a "last played" episode and the User hasn't
     *     "finished" watching it, return that episode
     *   - If the "last played" episode was "finished," return the
     *     next episode after that, if any
     *   - Otherwise, return the first Episode
     */
    pickResumeForMedia(media: IMedia): Promise<ITrack>;

    /**
     * Save tracking data for the given Media instance
     */
    saveTrack(
        media: IMedia,
        resumeTimeSeconds: number,
        videoDurationSeconds: number,
    ): Promise<void>;

    /**
     * Load recently watched media
     */
    queryRecent(): AsyncIterable<IRecentMedia>;

}
