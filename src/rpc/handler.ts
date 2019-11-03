import { DefaultMatcher } from "../match/default";
import { IMedia } from "../model";
import { Shougun } from "../shougun";

export class RpcHandler {
    public readonly VERSION = 1;

    constructor(
        private readonly shougun: Shougun,
    ) {}

    public async search(query: string) {
        const media = await this.shougun.search(query);

        const matcher = new DefaultMatcher();
        const sorted = matcher.sort(
            query,
            media,
            item => item.title,
        );

        // return a subset; results after this point are
        // usually garbage anyway
        return sorted.slice(0, 20);
    }

    public async start(media: IMedia) {
        const candidates = await this.shougun.search(media.title);
        if (!candidates) throw new Error(`No results for ${media.title}`);

        for (const c of candidates) {
            if (c.discovery === media.discovery && c.id === media.id) {
                return this.shougun.play(c);
            }
        }

        throw new Error(`No media with title ${media.title} and ID ${media.id}`);
    }

    public async startByTitle(title: string) {
        const media = await this.shougun.findMedia(title);
        if (!media) throw new Error(`No result for ${title}`);

        return this.shougun.play(media);
    }
}
