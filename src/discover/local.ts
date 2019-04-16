import fs from "fs-extra";
import os from "os";
import path from "path";

import { IServer, ServedPlayable } from "../playback/serve";
import { HierarchicalDiscovery, IHierarchy } from "./hierarchical";

class LocalFileHierarchy implements IHierarchy<string> {
    constructor(
        private server: IServer,
    ) {}

    public idOf(file: string) {
        // TODO: we probably want more context here...
        // EG: series vs season vs etc
        return file;
    }

    public async parentOf(file: string) {
        return path.dirname(file);
    }

    public async childrenOf(file: string) {
        try {
            const contents = await fs.readdir(file);
            return contents.map(fileName =>
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
    constructor(server: IServer, rootPath: string) {
        super(new LocalFileHierarchy(server), resolvePath(rootPath));
    }
}
