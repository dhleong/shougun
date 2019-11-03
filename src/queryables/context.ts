import { Context } from "../context";
import { IMedia, IQueryable } from "../model";

/**
 * The ContextQueryable is a core component that provides query results from
 * the local Discovery via Context.  If it is not provided to Shougun, you
 * will not get any results from local Discovery.
 */
export class ContextQueryable implements IQueryable {

    public async *findMedia(context: Context, query: string): AsyncIterable<IMedia> {
        const candidates = await context.allTitles();
        const best = context.matcher.findBest(query, candidates, (media: IMedia) => {
            return media.title;
        });

        if (best) {
            yield best;
        }
    }

    public async queryRecommended(context: Context) {
        return {
            Shougun: this.inflateRecommended(context),
        };
    }

    private async *inflateRecommended(context: Context) {
        for await (const result of context.tracker.queryRecent()) {
            const id = result.seriesId || result.id;
            const media = await context.getMediaById(id);
            if (media) {
                yield media;
            }
        }
    }

}
