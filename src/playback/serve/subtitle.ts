import _debug from "debug";
const debug = _debug("shougun:subtitle");

import ffmpeg from "fluent-ffmpeg";
import stream = require("stream");

import { ITextTrack } from "../../media/analyze";

export const extractSubtitlesTrack = (
    localPath: string,
    track: ITextTrack,
    opts: { autoEnd?: boolean } = {},
) => new Promise<stream.PassThrough>((resolve, reject) => {
    const pipe = new stream.PassThrough();

    // NOTE: Using the .map() method causes the library to wrap our stream
    // selection in [brackets] which apparently breaks it? Not sure what's
    // the deal there....
    const command = ffmpeg(localPath)
        .outputOption("-map", `0:${track.index}`)
        .outputFormat("webvtt")
        .on("error", e => {
            debug("error extracting subtitles", localPath, e);
            reject(e);
        })
        .on("end", () => {
            debug("done extracting subtitles @", localPath);
            pipe.end();
        });

    pipe.once("close", () => {
        // the user stopped viewing the stream; stop transcoding
        debug("pipe closed; shut down transcode");
        command.kill("SIGKILL");
    });

    // don't end it automatically (IE on error); we'll do it
    // ourselves (see above)
    const end = opts.autoEnd === true;
    command.output(pipe, { end }).run();

    debug("end=", end);

    // See HACKS in transcode.ts
    setTimeout(() => {
        resolve(pipe);
    }, 1000);
});
