import _debug from "debug";

import ffmpeg from "fluent-ffmpeg";

import { ITextTrack } from "../../media/analyze";
import { ffmpegAsPromise, IFfmpegOpts } from "./ffmpeg";

export function extractSubtitlesTrack(
    localPath: string,
    track: ITextTrack,
    opts: IFfmpegOpts = {},
) {
    // NOTE: Using the .map() method causes the library to wrap our stream
    // selection in [brackets] which apparently breaks it? Not sure what's
    // the deal there....
    const command = ffmpeg(localPath)
        .outputOption("-map", `0:${track.index}`)
        .outputFormat("webvtt");

    return ffmpegAsPromise(`extract subtitles from ${localPath}`, command, opts);
}
