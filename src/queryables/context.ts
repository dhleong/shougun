import { Context } from "../context";
import { IMedia, IQueryable } from "../model";

/**
 * The ContextQueryable is a core component that provides query results from
 * the local Discovery via Context.  If it is not provided to Shougun, you
 * will not get any results from local Discovery.
 */
export class ContextQueryable implements IQueryable {

    public async findMedia(context: Context, query: string): Promise<Iterable<IMedia>> {
        const candidates = await context.allTitles();
        const best = context.matcher.findBest(query, candidates, (media: IMedia) => {
            return media.title;
        });
        if (!best) return [];
        return [best];
    }

}
