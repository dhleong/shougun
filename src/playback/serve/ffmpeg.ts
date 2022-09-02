import _debug from "debug";

import ffmpeg from "fluent-ffmpeg";
import stream from "stream";

const debug = _debug("shougun:serve:ffmpeg");

export interface IFfmpegOpts {
    autoEnd?: boolean;
    config?: (cmd: ffmpeg.FfmpegCommand) => void;
}

export const ffmpegAsPromise = (
    logContext: string,
    command: ffmpeg.FfmpegCommand,
    opts: IFfmpegOpts = {},
    pipe: stream.PassThrough = new stream.PassThrough(),
) =>
    new Promise<stream.PassThrough>((resolve, reject) => {
        command
            .on("start", (cmd) => {
                debug("start", logContext, ":", cmd);
            })
            .once("progress", (_data) => {
                debug("progress @", logContext);
                resolve(pipe);
            })
            .on("error", (e) => {
                debug("error", logContext, e);
                reject(e);
            })
            .on("end", () => {
                debug("done", logContext);
                pipe.end();
            });

        if (opts.config) {
            opts.config(command);
        }

        pipe.once("close", () => {
            // the user stopped viewing the stream; stop transcoding
            debug("pipe closed; shut down:", logContext);
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
