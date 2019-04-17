import fs from "fs-extra";
import os from "os";
import path from "path";

import { IServer, ServedPlayable } from "../playback/serve";
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

class LocalFileHierarchy implements IHierarchy<string> {

    private filesBlacklist: Set<string>;

    constructor(
        private server: IServer,
        options: {
            filesBlacklist?: string[],
        } = {},
    ) {
        this.filesBlacklist = new Set([
            ...relevantFileBlacklist,
            ...(options.filesBlacklist || []),
        ]);
    }

    public idOf(file: string) {
        // TODO: we probably want more context here...
        // EG: series vs season vs etc
        return file;
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
                // FIXME: only if this is a ENOTDIR
                return null;
            }

            throw e;
        }
    }

    public playableFactory(file: string) {
        return async () => ServedPlayable.createFromPath(
            this.server,
            file,
        );
    }
}

function resolvePath(original: string) {
    return path.resolve(
        original.replace("~", os.homedir()),
    );
}

export class LocalDiscovery extends HierarchicalDiscovery<string> {

    public readonly id: DiscoveryId;

    constructor(server: IServer, rootPath: string) {
        super(new LocalFileHierarchy(server), resolvePath(rootPath));

        this.id = `local:${rootPath}`;
    }
}
