import _debug from "debug";
const debug = _debug("shougun:duration");

import { analyzeFile } from "./analyze";

export async function extractDuration(
    localPath: string,
): Promise<number> {
    const data = await analyzeFile(localPath);
    if (!data.duration) {
        debug("full analysis=", data);
        throw new Error(`Unable to extract duration of ${localPath}`);
    }

    return data.duration;
}
