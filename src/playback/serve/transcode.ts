import _debug from "debug";

import fastify from "fastify";
import ffmpeg from "fluent-ffmpeg";
import stream = require("stream");

import { IVideoAnalysis } from "../../media/analyze";
import { IPlayerCapabilities } from "../player";
import { ffmpegAsPromise, IFfmpegOpts } from "./ffmpeg";

const debug = _debug("shougun:transcode");

function transcodeWithOptions(
    pipe: stream.PassThrough,
    localPath: string,
    startTimeSeconds: number | undefined,
    opts: IFfmpegOpts,
    ...ffmpegOptions: string[] // tslint:disable-line
) {
    const command = ffmpeg(localPath)
        .outputFormat("mp4")

        .withOptions(ffmpegOptions);
    if (startTimeSeconds) {
        command.setStartTime(startTimeSeconds);
    }

    return ffmpegAsPromise(`transcode ${localPath}`, command, opts, pipe);
}

export async function transcodeForAnalysis(
    analysis: IVideoAnalysis,
    capabilities: IPlayerCapabilities,
    localPath: string,
    startTimeSeconds?: number,
) {
    const pipe = new stream.PassThrough();

    return transcodeWithOptions(pipe, localPath, startTimeSeconds, {
        config: (command) => {
            debug("configure transcoder with:", analysis);

            // TODO: future work might downsample if the player doesn't
            // support the given resolution

            if (capabilities.supportsVideoTrack(analysis.video)) {
                debug("pass-through supported video track:", analysis.video);
                command.videoCodec("copy");
            } else {
                debug("must transcode unsupported video", analysis.video);

                // if the player has restrictions on the pixel formats it
                // supports, check that and transform in necessary
                const { pixelFormat } = analysis.video;
                if (
                    pixelFormat &&
                    capabilities.supportsPixelFormat &&
                    !capabilities.supportsPixelFormat(pixelFormat)
                ) {
                    // NOTE: in theory, chromecast ultra supports HDR/10bit,
                    // so on such devices we should be able to preserve that
                    // (eg: yuv420p10le) but in practice it causes tearing,
                    // so we keep it simple:
                    debug("tranform unsupported pixel format to yuv420p");
                    command.addOptions(["-pix_fmt yuv420p"]);
                }
            }

            if (capabilities.supportsAudioTrack(analysis.audio)) {
                debug("pass-through supported audio track:", analysis.audio);
                command.audioCodec("copy");
            } else {
                // use ac3 to preserve surround sound for dts input
                debug("must transcode audio:", analysis.audio);
                command.audioCodec("ac3");
            }

            if (!analysis.audio.isDefault) {
                debug("select non-default audio track");
                command.addOptions("-map", `0:${analysis.video.index}`);
                command.addOptions("-map", `0:${analysis.audio.index}`);
            }

            // it seems we may always need this, even when both audio and
            // video formats are supported; since we have ShougunPlayer to
            // manage seeking through transcoded video, it seems fine to
            // always include this
            command.addOptions([
                "-movflags frag_keyframe+empty_moov+faststart+delay_moov",
                "-strict experimental",
            ]);
        },
    });
}

export async function serveTranscodedForAnalysis(
    analysis: IVideoAnalysis,
    capabilities: IPlayerCapabilities,
    req: fastify.FastifyRequest<any>,
    reply: fastify.FastifyReply<any>,
    localPath: string,
    startTimeSeconds?: number,
): Promise<NodeJS.ReadableStream> {
    reply.status(200);
    return transcodeForAnalysis(
        analysis,
        capabilities,
        localPath,
        startTimeSeconds,
    );
}
