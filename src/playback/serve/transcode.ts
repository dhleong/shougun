import _debug from "debug";
const debug = _debug("shougun:transcode");

import fastify from "fastify";
import ffmpeg from "fluent-ffmpeg";
import stream = require("stream");

import { IVideoAnalysis } from "../../media/analyze";
import { IPlayerCapabilities } from "../player";

const transcodeWithOptions = (
    pipe: stream.PassThrough,
    localPath: string,
    startTimeSeconds: number | undefined,
    opts: {
        autoEnd?: boolean,
        config?: (cmd: ffmpeg.FfmpegCommand) => void,
    },
    ...ffmpegOptions: string[]  // tslint:disable-line
) => new Promise<stream.PassThrough>((resolve, reject) => {
    const command = ffmpeg(localPath)
        .outputFormat("mp4")

        .withOptions(ffmpegOptions)

        .on("start", cmd => {
            debug("start:", cmd);
        })
        .once("progress", data => {
            debug("progress @", localPath);
            resolve(pipe);
        })
        .on("error", e => {
            debug("error transcoding", localPath, e);
            reject(e);
        })
        .on("end", () => {
            debug("done transcoding", localPath);
            pipe.end();
        });

    if (startTimeSeconds) {
        command.setStartTime(startTimeSeconds);
    }

    if (opts.config) {
        opts.config(command);
    }

    pipe.once("close", () => {
        // the user stopped viewing the stream; stop transcoding
        debug("pipe closed; shut down transcode");
        command.kill("SIGKILL");
    });

    // don't end it automatically (IE on error); we'll do it
    // ourselves (see above)
    const end = opts.autoEnd === true;
    command.output(pipe, { end }).run();

    // HACKS: if we don't get an error *or* otherwise resolve in 1s,
    // just resolve so we can *try* to read from the pipe.
    // TODO: Perhaps if `pipe` read from the command output but stored
    // it in a buffer until downstream was ready to consume, it'd work
    // without this hack?
    setTimeout(() => {
        resolve(pipe);
    }, 1000);
});

// priority list of option sets to be used with ffmpeg
// to try to transcode the input file
const ffmpegOptionSets = [
    [],

    // these flags help ensure the output is streamable,
    // but may prevent seeking
    [
        "-movflags frag_keyframe+empty_moov+faststart",
        "-strict experimental",

        // for source files with DTS audio, for example, we *must* transcode
        // to AC3 to keep surround sound on chromecast. if the source is
        // stereo, this seems to still be acceptable. future work could
        // consider checking the source file's codec and comparing with
        // player capabilities before doing something like this...
        "-acodec ac3",
    ],

    // fall back to a simpler set of flags
    [
        "-movflags frag_keyframe+empty_moov+faststart",
        "-strict experimental",
    ],
];

export async function transcode(
    localPath: string,
    startTimeSeconds?: number,
) {
    const pipe = new stream.PassThrough();

    for (let i = 0; i < ffmpegOptionSets.length; ++i) {
        const optionSet = ffmpegOptionSets[i];
        try {
            const autoEnd = i >= ffmpegOptionSets.length - 1;
            return await transcodeWithOptions(
                pipe, localPath, startTimeSeconds, {
                    autoEnd,
                }, ...optionSet,
            );
        } catch (e) {
            debug(`error with options ${i} (${optionSet})...`, e);
            if (i < ffmpegOptionSets.length - 1) {
                debug("fallback to next options set");
            }
        }
    }

    throw new Error(`Unable to transcode ${localPath}`);
}

export async function transcodeForAnalysis(
    analysis: IVideoAnalysis,
    capabilities: IPlayerCapabilities,
    localPath: string,
    startTimeSeconds?: number,
) {
    const pipe = new stream.PassThrough();

    return transcodeWithOptions(pipe, localPath, startTimeSeconds, {
        config: command => {
            debug("configure transcoder with:", analysis);

            if (capabilities.supportsVideoTrack(analysis.video)) {
                debug("pass-through supported video track:", analysis.video);
                command.videoCodec("copy");
            } else {
                debug("must transcode unsupported video", analysis.video);

                // if the player has restrictions on the pixel formats it
                // supports, check that and transform in necessary
                const { pixelFormat } = analysis.video;
                if (
                    pixelFormat
                    && capabilities.supportsPixelFormat
                    && !capabilities.supportsPixelFormat(pixelFormat)
                ) {
                    // NOTE: in theory, chromecast ultra supports HDR/10bit,
                    // so on such devices we should be able to preserve that
                    // (eg: yuv420p10le) but in practice it causes tearing,
                    // so we keep it simple:
                    debug("tranform unsupported pixel format to yuv420p");
                    command.addOptions([
                        "-pix_fmt yuv420p",
                    ]);
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

            // it seems we may always need this, even when both audio and
            // video formats are supported; since we have ShougunPlayer to
            // manage seeking through transcoded video, it seems fine to
            // always include this
            command.addOptions([
                "-movflags frag_keyframe+empty_moov+faststart",
                "-strict experimental",
            ]);
        },
    });
}

export async function serveTranscoded(
    req: fastify.FastifyRequest<any>,
    reply: fastify.FastifyReply<any>,
    localPath: string,
    startTimeSeconds?: number,
): Promise<NodeJS.ReadableStream> {
    reply.status(200);
    return transcode(localPath, startTimeSeconds);
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
        analysis, capabilities,
        localPath, startTimeSeconds,
    );
}
