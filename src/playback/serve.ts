import fastify from "fastify";
import internalIp from "internal-ip";
import mime from "mime";
import path from "path";
import url from "url";

import _debug from "debug";
const debug = _debug("shougun:serve");

import { extractDuration } from "../media/duration";
import { ILocalMedia, IPlayable } from "../model";
import { serveMp4 } from "./serve/mp4";
import { serveTranscoded } from "./serve/transcode";

export interface IServer {
    serve(media: ILocalMedia): Promise<string>;
}

// tslint:disable max-classes-per-file

export class Server implements IServer {

    private server: fastify.FastifyInstance | undefined;
    private address: string | undefined;

    // TODO expire old entries over time
    private media: {[id: string]: ILocalMedia} = {};

    public close() {
        const s = this.server;
        if (!s) return;
        s.close();
    }

    public async serve(mediaEntry: ILocalMedia) {
        this.media[mediaEntry.id] = mediaEntry;
        const address = await this.ensureServing();
        const encodedId = encodeURIComponent(mediaEntry.id);
        return `http://${address}/playable/id/${encodedId}`;
    }

    private async ensureServing(): Promise<string> {
        const existing = this.address;
        if (existing) return existing;

        const server = fastify({
            logger: debug.enabled,

            // NOTE: some IDs may be arbitrarily long file paths;
            // let's support that
            maxParamLength: 512,
        });
        server.get("/playable/id/:id", async (req, reply) => {
            const id = req.params.id;
            debug("request playable @", id);

            const media = this.media[id];
            if (!media) throw new Error("No such media");

            const { contentType, localPath } = media;
            if (contentType === "video/mp4") {
                return serveMp4(req, reply, localPath);
            }

            return serveTranscoded(req, reply, localPath);
        });

        this.server = server;
        const servingOn = await server.listen(0, "0.0.0.0");

        const { port } = url.parse(servingOn);

        const internal = await internalIp.v4();
        const actual = internal
            ? internal + ":" + port
            : servingOn;

        debug("serving on", actual);
        this.address = actual;
        return actual;
    }
}

export class ServedPlayable implements IPlayable {
    public static async createFromPath(server: IServer, localPath: string) {
        const type = mime.getType(localPath);
        if (!type) throw new Error(`Unknown file type at ${localPath}`);

        // FIXME: proper ID extraction?
        const id = localPath;

        const durationSeconds = await extractDuration(localPath);

        return new ServedPlayable(
            server,
            id,
            type,
            localPath,
            durationSeconds,
        );
    }

    constructor(
        private server: IServer,
        public readonly id: string,
        public readonly contentType: string,
        public readonly localPath: string,
        public readonly durationSeconds: number,
    ) {}

    public async getMetadata() {
        // TODO
        const title = path.basename(this.localPath);
        return { title };
    }

    public async getUrl() {
        return this.server.serve(this);
    }
}
