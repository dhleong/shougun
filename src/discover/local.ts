import fs from "fs-extra";
import path from "path";

import { Context } from "../context";
import { resolvePath } from "../media/util";
import { IMedia } from "../model";
import { ServedPlayable } from "../playback/serve";
import { DiscoveryId } from "./base";
import { HierarchicalDiscovery, IHierarchy } from "./hierarchical";

// file/folder names that are never relevant
const relevantFileBlacklist = [
    "iMovie Library.imovielibrary",
    "iMovie Theater.theater",
];

export function isRelevantFile(
    fileName: string,
) {
    // ignore "hidden" directories
    if (fileName.startsWith(".")) return false;

    return true;
}

export interface ILocalFileOptions {
    filesBlacklist?: string[];
}

class LocalFileHierarchy implements IHierarchy<string> {

    private filesBlacklist: Set<string>;

    constructor(
        options: ILocalFileOptions,
    ) {
        this.filesBlacklist = new Set([
            ...relevantFileBlacklist,
            ...(options.filesBlacklist || []),
        ]);
    }

    public equals(first: string, second: string) {
        return first === second;
    }

    public nameOf(file: string) {
        return path.basename(file);
    }

    public async parentOf(file: string) {
        return path.dirname(file);
    }

    public async childrenOf(file: string) {
        try {
            const contents = await fs.readdir(file);
            return contents.filter(fileName =>
                !this.filesBlacklist.has(fileName)
                    && isRelevantFile(fileName),
            ).map(fileName =>
                path.join(file, fileName),
            );
        } catch (e) {
            if (e.code === "ENOTDIR") {
                // file is not a directory
                return null;
            }

            // unexpected error
            throw e;
        }
    }

    public async createPlayable(
        context: Context,
        media: IMedia,
        localFilePath: string,
    ) {
        return ServedPlayable.createFromPath(
            context.server,
            media,
            localFilePath,
        );
    }
}

export class LocalDiscovery extends HierarchicalDiscovery<string> {

    public readonly id: DiscoveryId;

    constructor(
        rootPath: string,
        options: ILocalFileOptions = {},
    ) {
        super(new LocalFileHierarchy(options), resolvePath(rootPath));

        this.id = `local:${rootPath}`;
    }
}
