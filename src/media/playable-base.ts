import { Context } from "../context";
import { IEpisode, IMedia, IPlayable, isEpisode } from "../model";
import { IPlaybackOptions } from "../playback/player";

const QUEUE_CONTEXT_EXTENT = 7;

export abstract class BasePlayable implements IPlayable {
    public abstract id: string;
    public abstract contentType: string;
    public abstract durationSeconds: number;
    public abstract media: IMedia;

    public abstract getUrl(context: Context, opts?: IPlaybackOptions | undefined): Promise<string>;

    public async loadQueueAround(context: Context): Promise<IMedia[]> {
        if (!isEpisode(this.media)) return [];

        const series = await context.getSeries(this.media.seriesId);
        if (!series) return [];

        // this is not ideal, but it will never be more than
        // a few hundred, so this is simple and fine for now...
        const episodes = series.seasons.reduce((result, s) => {
            result.push(...s.episodes);
            return result;
        }, [] as IEpisode[]);

        const idx = episodes.findIndex(ep => ep.id === this.media.id);
        if (idx === -1) {
            throw new Error(`Couldn't find last-watched episode ${this.media.title}`);
        }

        const start = Math.max(0, idx - QUEUE_CONTEXT_EXTENT);
        const end = Math.min(episodes.length - 1, idx + QUEUE_CONTEXT_EXTENT);

        return episodes.slice(start, end);
    }

}
