import { IMedia, ISeries, isSeries, IMediaPrefs } from "../model";
import { ILoanCreate, ILoanData, ITrack, ITracker } from "./base";
import { IViewedInformation } from "./persistent";

export class TracklessTracker implements ITracker {
    private prefs: { [key: string]: IMediaPrefs } = {};

    public markBorrowReturned(_tokens: string[]): Promise<void> {
        throw new Error("Loans not supported");
    }
    public returnBorrowed(
        _tokens: string[],
        _viewedInformation: IViewedInformation[],
    ): Promise<void> {
        throw new Error("Loans not supported");
    }
    public createLoan(_track: ILoanCreate): Promise<void> {
        throw new Error("Loans not supported");
    }
    public retrieveBorrowed(): Promise<ILoanData> {
        throw new Error("Loans not supported");
    }

    public async pickResumeForMedia(media: IMedia): Promise<ITrack> {
        if (!isSeries(media)) {
            return { media };
        }

        // TODO: seasons and episodes should *probably* be loaded
        // via promise....
        const series = media as ISeries;
        const episode = series.seasons[0].episodes[0];
        return { media: episode };
    }

    public async saveTrack(
        _media: IMedia,
        _resumeTimeSeconds: number,
        _videoDurationSeconds: number,
    ): Promise<void> {
        // nop
    }

    public async *queryRecent() {
        // nop
    }

    public async deletePrefsForSeries(seriesId: string) {
        delete this.prefs[seriesId];
    }

    public async loadPrefsForSeries(seriesId: string) {
        return this.prefs[seriesId];
    }

    public async updatePrefsForSeries(seriesId: string, prefs: IMediaPrefs) {
        const updated = {
            ...this.prefs[seriesId],
            ...prefs,
        };
        this.prefs[seriesId] = updated;
        return updated;
    }
}
