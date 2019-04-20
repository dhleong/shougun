import fastify from "fastify";
import internalIp from "internal-ip";
import mime from "mime";
import path from "path";
import querystring from "querystring";
import url from "url";

import _debug from "debug";
const debug = _debug("shougun:serve");

import { Context } from "../context";
import { extractDuration } from "../media/duration";
import { ILocalMedia, IMedia, IMediaMetadata, IPlayable, isEpisode } from "../model";
import { IPlaybackOptions } from "./player";
import { serveMp4 } from "./serve/mp4";
import { serveTranscoded } from "./serve/transcode";

export interface IServer {
    /**
     * If a start time is provided via `opts` AND we serve
     * the file via transcoding, we will try to start transcoding
     * at that time
     */
    serve(
        media: ILocalMedia,
        opts?: IPlaybackOptions,
    ): Promise<string>;
}

// tslint:disable max-classes-per-file

export class Server implements IServer {

    private server: fastify.FastifyInstance | undefined;
    private address: string | undefined;

    private media: {[id: string]: ILocalMedia} = {};
    private activeStreams: {[id: string]: number} = {};

    public close() {
        const s = this.server;
        if (!s) return;
        s.close();
        this.server = undefined;
    }

    public async serve(
        mediaEntry: ILocalMedia,
        opts?: IPlaybackOptions,
    ) {
        this.media[mediaEntry.id] = mediaEntry;
        const address = await this.ensureServing();
        const encodedId = encodeURIComponent(mediaEntry.id);

        const base = `http://${address}/playable/id/${encodedId}`;
        if (!opts || !opts.currentTime || opts.currentTime <= 0) {
            return base;
        }

        return base + "?" + querystring.stringify({
            startTime: opts.currentTime,
        });
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

            const onStreamEnded = () => {
                this.onStreamEnded(media);
            };

            const { contentType, localPath } = media;
            let stream: NodeJS.ReadableStream;
            if (contentType === "video/mp4") {
                stream = await serveMp4(
                    req, reply, localPath,
                );
            } else {
                const startTime = req.query.startTime || 0;

                stream = await serveTranscoded(
                    req, reply, localPath, startTime,
                );
            }

            debug("got stream", stream);
            stream.once("close", onStreamEnded);

            // if we get here, the stream was created without error
            this.onStreamStarted(media);

            // serve!
            return stream;
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

    private onStreamStarted(media: ILocalMedia) {
        debug(`stream (${media.id}) started...`);
        if (!this.activeStreams[media.id]) {
            this.activeStreams[media.id] = 1;
        } else {
            ++this.activeStreams[media.id];
        }
    }

    private onStreamEnded(media: ILocalMedia) {
        if (!this.activeStreams[media.id]) {
            throw new Error(`Never started ${media.id} but got End...`);
        }

        debug(`stream (${media.id}) ended...`);
        const count = --this.activeStreams[media.id];
        if (count === 0) {
            setTimeout(() => this.checkStreamsForShutdown(), 2000);
        }
    }

    private checkStreamsForShutdown() {
        for (const id of Object.keys(this.activeStreams)) {
            if (this.activeStreams[id] > 0) {
                // still active streams
                debug(`found active stream (${id}); stay alive`);
                return;
            } else {
                // delete the media reference; nobody is watching
                delete this.media[id];
            }
        }

        debug("no remaining active streams; shut down server");
        this.close();
    }
}

export class ServedPlayable implements IPlayable {
    public static async createFromPath(
        server: IServer,
        media: IMedia,
        localPath: string,
    ) {
        const type = mime.getType(localPath);
        if (!type) throw new Error(`Unknown file type at ${localPath}`);

        // FIXME: proper ID extraction?
        const id = localPath;

        const durationSeconds = await extractDuration(localPath);

        return new ServedPlayable(
            server,
            media,
            id,
            type,
            localPath,
            durationSeconds,
        );
    }

    constructor(
        private readonly server: IServer,
        private readonly media: IMedia,
        public readonly id: string,
        public readonly contentType: string,
        public readonly localPath: string,
        public readonly durationSeconds: number,
    ) {}

    public async getMetadata(context: Context) {
        const metadata: IMediaMetadata = {};
        const mediaTitle = this.media.title;
        if (mediaTitle) {
            metadata.title = mediaTitle;
        } else {
            metadata.title = path.basename(this.localPath);
        }

        if (isEpisode(this.media)) {
            // load series title
            const series = await context.getSeries(this.media.seriesId);
            if (series) {
                metadata.seriesTitle = series.title;
            }
        }

        return metadata;
    }

    public async getUrl(opts?: IPlaybackOptions) {
        return this.server.serve(this, opts);
    }
}
