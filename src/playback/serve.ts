import fastify from "fastify";
import internalIp = require("internal-ip");
import mime from "mime";
import url from "url";

import _debug from "debug";
const debug = _debug("shougun:serve");

import { Context } from "../context";
import { analyzeFile } from "../media/analyze";
import { extractDuration } from "../media/duration";
import { BasePlayable } from "../media/playable-base";
import { ILocalMedia, IMedia, IPlayableWithClients } from "../model";
import { withQuery } from "../util/url";
import { IPlaybackOptions } from "./player";
import { serveForPlayer } from "./serve/player-based";
import { extractSubtitlesTrack } from "./serve/subtitle";

export interface IServer {
    addActiveClient(client: string): void;
    removeActiveClient(client: string): void;

    /**
     * If a start time is provided via `opts` AND we serve
     * the file via transcoding, we will try to start transcoding
     * at that time
     */
    serve(
        context: Context,
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
    private activeRequests = 0;

    private activeClients = new Set<string>();

    private checkStreamsForShutdownRequest: NodeJS.Timeout | undefined;

    public close() {
        const s = this.server;
        if (!s) return;
        s.close();
        this.server = undefined;
        this.address = undefined;
    }

    public addActiveClient(client: string) {
        debug("add active client:", client);
        this.activeClients.add(client);
    }

    public removeActiveClient(client: string) {
        debug("remove active client:", client);
        this.activeClients.delete(client);
        this.deferCheckStreamsForShutdown();
    }

    public async serve(
        context: Context,
        mediaEntry: ILocalMedia,
        opts?: IPlaybackOptions,
    ) {
        this.media[mediaEntry.id] = mediaEntry;
        const address = await this.ensureServing(context);
        const encodedId = encodeURIComponent(mediaEntry.id);

        const base = `http://${address}/playable/id/${encodedId}`;
        if (!opts || !opts.currentTime || opts.currentTime <= 0) {
            return base;
        }

        return withQuery(base, {
            startTime: opts.currentTime,
        });
    }

    private async ensureServing(context: Context): Promise<string> {
        const existing = this.address;
        if (existing) return existing;

        const server = fastify({
            logger: debug.enabled,

            // NOTE: some IDs may be arbitrarily long file paths;
            // let's support that
            maxParamLength: 512,
        });

        server.get("/playable/id/:id/subtitles/:track", async (req, reply) => {
            try {
                debug(">> active subtitle request!");
                ++this.activeRequests;
                return await this.handleSubtitleRequest(context, req, reply);
            } finally {
                debug("<< end subtitle request");
                --this.activeRequests;
                this.deferCheckStreamsForShutdown();
            }
        });
        server.get("/playable/id/:id", async (req, reply) => {
            try {
                debug(">> active request!");
                ++this.activeRequests;
                return await this.handlePlayableRequest(context, req, reply);
            } finally {
                debug("<< end request");
                --this.activeRequests;
                this.deferCheckStreamsForShutdown();
            }
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

    // FIXME: This ought to be some sort of middleware, probably
    private async resolvePlayable(
        context: Context,
        req: fastify.FastifyRequest<any>,
    ) {
        const id = req.params.id;
        debug("request playable @", id);
        debug(" - headers:", req.headers);

        const media = this.media[id];
        if (!media) throw new Error("No such media");
        let toPlay = media;

        const { queueIndex } = req.query;
        if (queueIndex !== undefined) {
            debug("pull actual playable from queue @", queueIndex);

            // following queue?
            // HAX: there's probably a better way to do this...
            const playable = media as ServedPlayable;
            const queue = await playable.loadQueueAround(context);
            toPlay = await context.discovery.createPlayable(
                context,
                queue[queueIndex],
            ) as ServedPlayable;

            // MORE HAX: this startTime is from the original media, probably
            delete req.query.startTime;

            debug("  -> ", toPlay.id, " @ ", toPlay.localPath);

            // NOTE: we still use `media` for onStreamStarted and
            // onStreamEnded, since those protect its existence in
            // the `this.media` map; we need to keep `media` there
            // since all the queued items are based on it. If `media`
            // were removed in favor of `toPlay`, we wouldn't be able
            // to play any of the other items in the queue anymore!
        }

        const onStreamEnded = () => {
            this.onStreamEnded(media);
        };

        return { media, playable: toPlay, onStreamEnded };
    }

    private async handlePlayableRequest(
        context: Context,
        req: fastify.FastifyRequest<any>,
        reply: fastify.FastifyReply<any>,
    ) {
        const { media, playable, onStreamEnded } = await this.resolvePlayable(context, req);

        const { player } = context;
        const { contentType, localPath } = playable;

        const stream = await serveForPlayer(
            player,
            req, reply,
            contentType, localPath, playable.media?.prefs,
        );

        debug("got stream @", req.headers.range);
        stream.once("close", () => {
            debug("end stream @", req.headers.range);
            onStreamEnded();
        });

        // if we get here, the stream was created without error
        this.onStreamStarted(media);

        // serve!
        return stream;
    }

    private async handleSubtitleRequest(
        context: Context,
        req: fastify.FastifyRequest<any>,
        reply: fastify.FastifyReply<any>,
    ) {
        const trackId = parseInt(req.params.track, 10);
        debug("Received request for subtitle track with id #", trackId);

        const { playable, media, onStreamEnded } = await this.resolvePlayable(context, req);

        const { localPath } = playable;
        const analysis = await analyzeFile(localPath);
        const track = analysis.subtitles.find(it => it.index === trackId);
        if (!track) {
            throw new Error("No such subtitle track");
        }

        debug("Extracting subtitle track", track);
        const stream = await extractSubtitlesTrack(localPath, track);

        debug("got stream @", req.headers.range);
        reply.status(200);

        stream.once("close", () => {
            debug("end stream @", req.headers.range);
            onStreamEnded();
        });

        // if we get here, the stream was created without error
        this.onStreamStarted(media);

        // serve!
        return stream;
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
            this.deferCheckStreamsForShutdown();
        }
    }

    private deferCheckStreamsForShutdown() {
        if (this.checkStreamsForShutdownRequest) {
            clearTimeout(this.checkStreamsForShutdownRequest);
        }
        this.checkStreamsForShutdownRequest = setTimeout(() => this.checkStreamsForShutdown(), 2000);
    }

    private checkStreamsForShutdown() {
        if (this.activeRequests) {
            debug(`found active requests; stay alive`);
            return;
        }

        if (this.activeClients.size) {
            debug(`found active clients; stay alive`);
            return;
        }

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

        debug("no remaining active streams or clients; shut down server");
        this.close();
    }
}

export class ServedPlayable extends BasePlayable implements IPlayableWithClients {
    public static async createFromPath(
        server: IServer,
        media: IMedia,
        localPath: string,
        localCoverPath?: string,
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
            localCoverPath,
            durationSeconds,
        );
    }

    constructor(
        private readonly server: IServer,
        public readonly media: IMedia,
        public readonly id: string,
        public readonly contentType: string,
        public readonly localPath: string,
        public readonly localCoverPath: string | undefined,
        public readonly durationSeconds: number,
    ) {
        super();
    }

    public addActiveClient(client: string) {
        this.server.addActiveClient(client);
    }

    public removeActiveClient(client: string) {
        this.server.removeActiveClient(client);
    }

    public async analyze() {
        return analyzeFile(this.localPath, {
            preferredAudioLanguage: this.media.prefs?.preferredAudioLanguage,
        });
    }

    public async getCoverUrl(context: Context) {
        const coverPath = this.localCoverPath;
        if (!coverPath) return;

        const extension = coverPath.substring(coverPath.lastIndexOf("."));
        const serveUrl = await this.server.serve(context, {
            contentType: mime.getType(coverPath) || "image/jpg",
            id: this.id + "/cover" + extension,
            localPath: coverPath,
        });
        debug("computed URL for cover", coverPath, " -> ", serveUrl);
        return serveUrl;
    }

    public async getUrl(context: Context, opts?: IPlaybackOptions) {
        const capabilities = await context.player.getCapabilities();
        if (capabilities.supportsLocalPlayback) {
            return "file://" + this.localPath;
        }

        const serveUrl = await this.server.serve(context, this, opts);
        debug("computed URL for", this.localPath, "with", opts, " -> ", serveUrl);
        return serveUrl;
    }
}
