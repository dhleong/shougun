import { IMedia, isEpisode } from "../model";
import { ITrack, ITracker } from "./base";

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
    loadById(id: string): Promise<ITrack>;
    save(info: IViewedInformation): Promise<void>;
}

export class PersistentTracker implements ITracker {

    constructor(
        private readonly storage: IStorage,
    ) {}

    public async pickResumeForMedia(media: IMedia): Promise<ITrack> {
        throw new Error("Method not implemented.");
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
}
