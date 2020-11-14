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

    const command = ffmpeg(localPath)
        .map("0:s:0")
        .outputFormat("webvtt");
        // .map(`0:${track.index}`);

    pipe.once("close", () => {
        // the user stopped viewing the stream; stop transcoding
        debug("pipe closed; shut down transcode");
        command.kill("SIGKILL");
    });

    command.output(pipe).run();

    return pipe;
}
