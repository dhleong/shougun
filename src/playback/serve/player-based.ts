import _debug from "debug";

import fastify from "fastify";

import { analyzeFile } from "../../media/analyze";
import { isVideo } from "../../media/util";
import { canPlayNatively, IPlayer } from "../player";

import { serveRanged } from "./ranged";
import { serveTranscodedForAnalysis } from "./transcode";
import { IMediaPrefs } from "../../model";

const debug = _debug("shougun:serve:player");

/**
 * serveForPlayer analyzes the media and compares with the IPlayer's
 * capabilities to determine the best way to serve the file, returning
 * a NodeJS.ReadableStream
 */
export async function serveForPlayer(
    player: IPlayer,
    req: fastify.FastifyRequest<any>,
    reply: fastify.FastifyReply<any>,
    contentType: string,
    localPath: string,
    mediaPrefs?: IMediaPrefs,
): Promise<NodeJS.ReadableStream> {
    if (!isVideo(localPath)) {
        // quick shortcut for cover art, etc
        debug(`serve ranges for non-video file: ${localPath}`);
        return serveRanged(req, reply, contentType, localPath);
    }

    const [analysis, capabilities] = await Promise.all([
        analyzeFile(localPath, {
            preferredAudioLanguage: mediaPrefs?.preferredAudioLanguage,
        }),
        player.getCapabilities(),
    ]);

    debug("analysis of", localPath, ":", analysis);
    const canStreamRanges = canPlayNatively(capabilities, analysis);

    if (!isVideo(localPath) || canStreamRanges) {
        debug(`serve ranges for ${contentType}: ${localPath}`);
        return serveRanged(req, reply, contentType, localPath);
    }

    if (
        !(
            capabilities.supportsContainer("mp4") &&
            capabilities.supportsVideoTrack({
                index: 0,
                codec: "h264",
                height: analysis.video.height,
                width: analysis.video.width,
            })
        )
    ) {
        // cannot transcode to mp4 either!
        throw new Error(
            `Player ${
                player.constructor.name
            } supports neither ${JSON.stringify(
                analysis,
            )} nor media transcoded to mp4`,
        );
    }

    const startTime = req.query.startTime || 0;
    debug(`serve transcoded from ${contentType} starting @`, startTime);

    return serveTranscodedForAnalysis(
        analysis,
        capabilities,
        req,
        reply,
        localPath,
        startTime,
    );
}
