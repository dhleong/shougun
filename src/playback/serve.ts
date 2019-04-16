import fastify from "fastify";
import fs from "fs-extra";
import internalIp from "internal-ip";
import path from "path";
import rangeParser from "range-parser";
import url from "url";

import _debug from "debug";
const debug = _debug("shougun:serve");

import { IPlayable } from "./model";

interface IMediaEntry {
    id: string;
    contentType: string;
    localPath: string;
}

export interface IServer {
    serve(media: IMediaEntry): Promise<string>;
}

// tslint:disable max-classes-per-file

export class Server implements IServer {

    private server: fastify.FastifyInstance | undefined;
    private address: string | undefined;

    // TODO expire old entries over time
    private media: {[id: string]: IMediaEntry} = {};

    public close() {
        const s = this.server;
        if (!s) return;
        s.close();
    }

    public async serve(mediaEntry: IMediaEntry) {
        this.media[mediaEntry.id] = mediaEntry;
        const address = await this.ensureServing();
        return `http://${address}/playable/id/${mediaEntry.id}`;
    }

    private async ensureServing(): Promise<string> {
        const existing = this.address;
        if (existing) return existing;

        const server = fastify({
            logger: debug.enabled,
        });
        server.get("/playable/id/:id", async (req, reply) => {
            const id = req.params.id;
            const { localPath } = this.media[id];
            if (!id) throw new Error("No such path");

            const stat = await fs.stat(localPath);
            const length = stat.size;

            // common headers
            reply.header("Content-Type", "video/mp4");

            const { range } = req.headers;
            if (range) {
                // range request
                const requestedRanges = rangeParser(length, range);
                if (typeof requestedRanges === "number") {
                    throw new Error("Invalid range");
                }

                const r = requestedRanges[0];
                reply.header("Content-Range", `bytes ${r.start}-${r.end}/${length}`);
                reply.header("Accept-Ranges", "bytes");
                reply.header("Content-Length", r.end - r.start + 1);
                reply.status(206);

                return fs.createReadStream(localPath, r);
            }

            reply.header("Content-Length", length);
            return fs.createReadStream(localPath);
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
    constructor(
        private server: IServer,
        public readonly id: string,
        public readonly contentType: string,
        public readonly localPath: string,
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
