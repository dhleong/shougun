import _debug from "debug";
const debug = _debug("shougun:duration");

import ffmpeg from "fluent-ffmpeg";

const ffprobe = (
    filePath: string,
) => new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
    });
});

export async function extractDuration(
    localPath: string,
): Promise<number> {
    const data = await ffprobe(localPath);
    if (!data.format.duration) {
        debug("full format=", data.format);
        throw new Error(`Unable to extract duration of ${localPath}`);
    }

    return data.format.duration;
}
