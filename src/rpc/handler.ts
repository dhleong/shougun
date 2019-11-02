import { Shougun } from "../shougun";

export class RpcHandler {
    constructor(
        private readonly shougun: Shougun,
    ) {}

    public async startByTitle(title: string) {
        const media = await this.shougun.findMedia(title);
        if (!media) throw new Error(`No result for ${title}`);

        return this.shougun.play(media);
    }
}
