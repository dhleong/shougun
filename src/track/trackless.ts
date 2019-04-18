import { IMedia, ISeries, isSeries } from "../model";
import { ITrack, ITracker } from "./base";

export class TracklessTracker implements ITracker {
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

    public async saveTrack(media: IMedia, resumeTimeSeconds: number): Promise<void> {
        // nop
    }

}
