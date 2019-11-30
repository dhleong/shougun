import _debug from "debug";
const debug = _debug("shougun:takeout:loader");

import fs from "fs-extra";
import os from "os";
import pathlib from "path";

import { extractDuration } from "../media/duration";
import { Shougun } from "../shougun";
import { ITakeoutInstruction, ITakeoutInstructions } from "./model";

export async function loadTakeout(
    shougun: Shougun,
) {
    const takeoutDir = pathlib.join(
        os.homedir(),
        ".config", "shougun", "takeout",
    );
    if (!await fs.pathExists(takeoutDir)) {
        debug("no takeout dir");
        return;
    }

    const takeoutFiles = await Promise.all(
        (await fs.readdir(takeoutDir)).map(async file => {
            const fullPath = pathlib.join(takeoutDir, file);
            return [
                fullPath,
                (await fs.stat(fullPath)).ctime.getTime(),
            ] as [string, number];
        }),
    );
    takeoutFiles.sort(([_, a], [__, b]) => {
        return b - a;
    });
    debug("load takeout files:", takeoutFiles);

    const saveInstruction = saveMediaTakeoutInstruction.bind(null, shougun);
    for (const [f] of takeoutFiles) {
        debug("loading takeout @", f);

        const instructions: ITakeoutInstructions = await fs.readJson(f);
        await Promise.all(instructions.nextMedia.map(saveInstruction));

        // TODO save the token for "returning" the takeout later
        // await shougun.context.tracker.

        debug("finished loading takeout @", f, "; delete it");
        await fs.remove(f);
    }
}

async function saveMediaTakeoutInstruction(
    shougun: Shougun,
    instruction: ITakeoutInstruction,
) {
    const media = await shougun.context.getMediaById(instruction.id);
    if (!media) {
        debug("NO MEDIA found for id:", instruction.id);
        return;
    }

    const localPath = await shougun.getLocalPath(media);
    if (!localPath) {
        debug("No local path for media with ID", media.id);
        return;
    }

    const { tracker } = shougun.context;
    const videoDurationSeconds = await extractDuration(localPath);
    debug(`saveTrack(${media.id}, ${instruction.resumeTimeSeconds}, ${videoDurationSeconds})`);
    return tracker.saveTrack(
        media,
        instruction.resumeTimeSeconds || 0,
        videoDurationSeconds,
    );
}
