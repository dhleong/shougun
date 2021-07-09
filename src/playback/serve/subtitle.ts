import _debug from "debug";
const debug = _debug("shougun:subtitle");

import ffmpeg from "fluent-ffmpeg";
import stream = require("stream");

import { ITextTrack } from "../../media/analyze";

export async function extractSubtitlesTrack(
    localPath: string,
    track: ITextTrack,
) {
    const pipe = new stream.PassThrough();

    // NOTE: Using the .map() method causes the library to wrap our stream
    // selection in [brackets] which apparently breaks it? Not sure what's
    // the deal there....
    const command = ffmpeg(localPath)
        .outputOption("-map", `0:${track.index}`)
        .outputFormat("webvtt");

    pipe.once("close", () => {
        // the user stopped viewing the stream; stop transcoding
        debug("pipe closed; shut down transcode");
        command.kill("SIGKILL");
    });

    command.output(pipe).run();

    return pipe;
}
