import _debug from "debug";
const debug = _debug("shougun:transcode");

import fastify from "fastify";
import ffmpeg from "fluent-ffmpeg";
import stream = require("stream");

const transcodeWithOptions = (
    pipe: stream.PassThrough,
    localPath: string,
    startTimeSeconds: number | undefined,
    opts: { autoEnd?: boolean },
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

export async function serveTranscoded(
    req: fastify.FastifyRequest<any>,
    reply: fastify.FastifyReply<any>,
    localPath: string,
    startTimeSeconds?: number,
): Promise<NodeJS.ReadableStream> {
    reply.status(200);
    return transcode(localPath, startTimeSeconds);
}
