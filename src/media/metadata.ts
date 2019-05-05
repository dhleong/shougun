import { Context } from "../context";
import { IMedia, IMediaMetadata, isEpisode } from "../model";

export async function getMetadata(context: Context, media: IMedia) {
    const metadata: IMediaMetadata = {
        title: media.title,
    };

    if (isEpisode(media)) {
        // load series title
        const series = await context.getSeries(media.seriesId);
        if (series) {
            metadata.seriesTitle = series.title;
        }
    }

    return metadata;
}
