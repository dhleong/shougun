import { Shougun } from "../shougun";

export class RpcHandler {
    constructor(
        private readonly shougun: Shougun,
    ) {}

    public async search(query: string) {
        const media = await this.shougun.search(query);
        const sorted = this.shougun.context.matcher.sort(
            query,
            media,
            item => item.title,
        );
        return sorted.slice(0, 20);
    }

    public async startByTitle(title: string) {
        const media = await this.shougun.findMedia(title);
        if (!media) throw new Error(`No result for ${title}`);

        return this.shougun.play(media);
    }
}
