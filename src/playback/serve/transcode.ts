import _debug from "debug";
const debug = _debug("shougun:transcode");

import fastify from "fastify";
import ffmpeg from "fluent-ffmpeg";
import stream = require("stream");

const transcodeWithOptions = (
    pipe: stream.Writable,
    localPath: string,
    opts: { autoEnd?: boolean },
    ...ffmpegOptions: string[]  // tslint:disable-line
) => new Promise<stream.Writable>((resolve, reject) => {
    const command = ffmpeg(localPath)
        .outputFormat("mp4")

        .withOptions(ffmpegOptions)

        .on("start", cmd => {
            debug("start:", cmd);
        })
        .once("progress", data => {
            resolve(pipe);
        })
        .on("error", e => {
            reject(e);
        })
        .on("end", () => {
            debug("done transcoding", localPath);
            pipe.end();
        });

    // don't end it automatically (IE on error); we'll do it
    // ourselves (see above)
    const end = opts.autoEnd === true;
    command.output(pipe, { end }).run();
});

// priority list of option sets to be used with ffmpeg
// to try to transcode the input file
const ffmpegOptionSets = [
    [],

    // these flags help ensure the output is streamable,
    // but may prevent seeking
    ["-movflags frag_keyframe+empty_moov+faststart"],
];

export async function transcode(
    localPath: string,
): Promise<stream.Writable> {
    const pipe = new stream.PassThrough();

    for (let i = 0; i < ffmpegOptionSets.length; ++i) {
        const optionSet = ffmpegOptionSets[i];
        try {
            const autoEnd = i >= ffmpegOptionSets.length - 1;
            return await transcodeWithOptions(pipe, localPath, {
                autoEnd,
            }, ...optionSet);
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
) {
    reply.status(200);
    return transcode(localPath);
}
