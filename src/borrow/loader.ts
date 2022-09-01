import _debug from "debug";

import fs from "fs-extra";
import os from "os";
import pathlib from "path";

import { extractDuration } from "../media/duration";
import { Shougun } from "../shougun";
import { ILoanInstruction, ILoanInstructions } from "./model";

const debug = _debug("shougun:borrow:loader");

async function saveMediaBorrowInstruction(
    shougun: Shougun,
    instruction: ILoanInstruction,
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
    debug(
        `saveTrack(${media.id}, ${instruction.resumeTimeSeconds}, ${videoDurationSeconds})`,
    );
    return tracker.saveTrack(
        media,
        instruction.resumeTimeSeconds || 0,
        videoDurationSeconds,
    );
}

/**
 * Load information about media that was loaned to us/that we borrowed
 */
export async function loadLoans(shougun: Shougun) {
    const borrowDir = pathlib.join(
        os.homedir(),
        ".config",
        "shougun",
        "borrow",
    );
    if (!(await fs.pathExists(borrowDir))) {
        debug("no borrow dir");
        return;
    }

    const borrowFiles = await Promise.all(
        (
            await fs.readdir(borrowDir)
        ).map(async (file) => {
            const fullPath = pathlib.join(borrowDir, file);
            return [fullPath, (await fs.stat(fullPath)).ctime.getTime()] as [
                string,
                number,
            ];
        }),
    );
    borrowFiles.sort(([, a], [, b]) => {
        return b - a;
    });
    debug("load borrow files:", borrowFiles);

    const saveInstruction = saveMediaBorrowInstruction.bind(null, shougun);
    for (const [f] of borrowFiles) {
        debug("loading borrow @", f);

        const instructions: ILoanInstructions = await fs.readJson(f);
        await Promise.all(instructions.nextMedia.map(saveInstruction));

        // save the token and serverId for "returning" the loan later
        await shougun.context.tracker.createLoan({
            serverId: instructions.serverId,
            token: instructions.token,
        });

        debug("finished loading borrow @", f, "; delete it");
        await fs.remove(f);
    }
}
