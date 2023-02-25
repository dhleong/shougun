import { toArray } from "babbling/dist/async";
import { Context } from "../context";
import { IMedia, IQueryable, MediaType } from "../model";

const MAX_RECOMMENDATIONS = 50;

/**
 * The ContextQueryable is a core component that provides query results from
 * the local Discovery via Context.  If it is not provided to Shougun, you
 * will not get any results from local Discovery.
 */
export class ContextQueryable implements IQueryable {
    public isProviderFor(media: IMedia): boolean {
        return media.type !== MediaType.ExternalPlayable;
    }

    public async *findMedia(
        context: Context,
        query: string,
    ): AsyncIterable<IMedia> {
        const candidates = await context.allTitles();
        const best = context.matcher.findBest(
            query,
            candidates,
            (media: IMedia) => {
                return media.title;
            },
        );

        if (best) {
            yield best;
        }
    }

    public async queryRecent(context: Context) {
        return {
            Shougun: this.inflateRecent(context),
        };
    }

    public async queryRecommended(context: Context) {
        // NOTE: we don't have a recommendation algorithm yet;
        // just do unwatched + recent
        const [all, recentlyWatched] = await Promise.all([
            context.allTitles(),
            toArray(
                context.tracker.queryRecent({
                    external: "exclude",
                    limit: 100,
                }),
            ),
        ]);

        return {
            Shougun: (async function* localRecents() {
                const recentlyWatchedIds = new Set();
                for (const recent of recentlyWatched) {
                    recentlyWatchedIds.add(recent.id);
                    if (recent.seriesId != null) {
                        recentlyWatchedIds.add(recent.seriesId);
                    }
                }

                // TODO Can we sort by how recently it was added?

                const notRecentlyWatched = [];
                for (const item of all) {
                    if (!recentlyWatchedIds.has(item.id)) {
                        notRecentlyWatched.push(item);

                        if (notRecentlyWatched.length > MAX_RECOMMENDATIONS) {
                            break;
                        }
                    }
                }

                yield* notRecentlyWatched;
            })(),
        };
    }

    private async *inflateRecent(context: Context) {
        for await (const result of context.tracker.queryRecent()) {
            const id = result.seriesId || result.id;
            const media = await context.getMediaById(id);
            if (media) {
                yield media;
            }
        }
    }
}
