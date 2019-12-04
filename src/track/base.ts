import { IMedia } from "../model";
import { IViewedInformation } from "./persistent";

export interface ITrack {
    media: IMedia;
    resumeTimeSeconds?: number;
}

export interface IRecentMedia {
    id: string;
    seriesId?: string;
    title: string;
}

export interface ILoanData {
    tokens: Array<{ serverId: string, token: string }>;
    viewedInformation: IViewedInformation[];
}

export interface ILoanCreate {
    token: string;
    serverId: string;
}

export interface ILoan extends ILoanCreate {
    createdTimestamp: number;
}

export interface ILoanTracker {

    createLoan(track: ILoanCreate): Promise<void>;
    markBorrowReturned(tokens: string[]): Promise<void>;
    retrieveBorrowed(): Promise<ILoanData>;
    returnBorrowed(
        tokens: string[],
        viewedInformation: IViewedInformation[],
    ): Promise<void>;

}

export interface ITracker extends ILoanTracker {

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
