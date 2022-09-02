import _debug from "debug";

import { analyzeFile } from "./analyze";

const debug = _debug("shougun:duration");

export async function extractDuration(localPath: string): Promise<number> {
    const data = await analyzeFile(localPath);
    if (!data.duration) {
        debug("full analysis=", data);
        throw new Error(`Unable to extract duration of ${localPath}`);
    }

    return data.duration;
}
