import { IMedia, ISeries, isSeries } from "../model";
import { ILoanCreate, ILoanData, ITrack, ITracker } from "./base";
import { IViewedInformation } from "./persistent";

export class TracklessTracker implements ITracker {
    public markBorrowReturned(tokens: string[]): Promise<void> {
        throw new Error("Loans not supported");
    }
    public returnBorrowed(tokens: string[], viewedInformation: IViewedInformation[]): Promise<void> {
        throw new Error("Loans not supported");
    }
    public createLoan(track: ILoanCreate): Promise<void> {
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
        media: IMedia,
        resumeTimeSeconds: number,
        videoDurationSeconds: number,
    ): Promise<void> {
        // nop
    }

    public async *queryRecent() {
        // nop
    }
}
