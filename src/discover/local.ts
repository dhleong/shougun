import _debug from "debug";
const debug = _debug("shougun:discovery:local");

import chokidar from "chokidar";
import fs from "fs-extra";
import path from "path";

import { Context } from "../context";
import { resolvePath } from "../media/util";
import { IMedia, IMediaMap } from "../model";
import { ServedPlayable } from "../playback/serve";
import { QueuedIterable } from "../util/queued-iterable";
import { ChangeType, DiscoveryId, IDiscoveredChange } from "./base";
import { HierarchicalDiscovery, IHierarchicalMedia, IHierarchy } from "./hierarchical";

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
            } else if (e.code === "ENOENT") {
                // directory doesn't exist? since we found it, it *ought*
                // to exist, but this can happen sometimes with network
                // mounted directories; just ignore it
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
        coverLocalFilePath?: string,
    ) {
        return ServedPlayable.createFromPath(
            context.server,
            media,
            localFilePath,
            coverLocalFilePath,
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

    public async *changes(context: Context): AsyncIterable<IDiscoveredChange> {
        // NOTE: if we are allowed to keep the process alive, we can
        // simply use the default "persistent" mode; otherwise, we have
        // to disable persistent mode AND fsevents, since otherwise it
        // will NOT fall back to polling
        const chokidarOpts: chokidar.WatchOptions = context.opts.allowProcessKeepalive
            ? { persistent: true }
            : {
                persistent: false,
                useFsEvents: false,
            };
        const events = chokidar.watch(this.root, chokidarOpts);

        debug("watching ", this.root);
        const iterable = new QueuedIterable<IDiscoveredChange>(() => {
            // cleanup:
            debug("cleanup changes subscription");
            events.close();
        });

        const lastMap: IMediaMap = {};
        for await (const m of this.discoverFromRoot(lastMap, this.root)) {
            lastMap[m.id] = m;
        }

        events.on("addDir", async newDir => {
            debug("new dir:", newDir);
            for await (const m of this.discoverFromRoot(lastMap, newDir)) {
                debug("Discovered", m);
                lastMap[m.id] = m;
                iterable.notify({
                    media: m,
                    type: ChangeType.MEDIA_ADDED,
                });
            }
        });

        events.on("unlinkDir", async dir => {
            debug("removed dir:", dir);
            for (const m of Object.values(lastMap)) {
                const mediaPath = (m as IHierarchicalMedia<string>).entity;
                if (mediaPath.startsWith(dir)) {
                    debug("removed media at", m);
                    delete lastMap[m.id];
                    iterable.notify({
                        media: m,
                        type: ChangeType.MEDIA_REMOVED,
                    });
                }
            }
        });

        events.on("add", async newFile => {
            debug("file added:", newFile);
            await this.scanForChanges(
                ChangeType.MEDIA_ADDED,
                lastMap,
                iterable,
                newFile,
            );
        });
        events.on("unlink", async removedFile => {
            debug("file removed:", removedFile);
            await this.scanForChanges(
                ChangeType.MEDIA_REMOVED,
                lastMap,
                iterable,
                removedFile,
            );
        });

        yield *iterable;
    }

    public async findByPath(
        context: Context,
        mediaPath: string,
    ): Promise<IMedia | undefined> {
        // only allow users to play files within our root
        const resolved = resolvePath(mediaPath);
        if (!resolved.startsWith(this.root)) {
            debug(`${resolved} is not under ${this.root}`);
            return;
        }

        // make sure it exists
        const exists = await fs.pathExists(resolved);
        if (!exists) return;

        return this.createRootMedia(resolved);
    }

    public async getLocalPath(
        context: Context,
        media: IMedia,
    ): Promise<string | undefined> {
        return this.ensureEntity(media);
    }

    private async scanForChanges(
        changeType: ChangeType,
        lastMap: IMediaMap,
        iterable: QueuedIterable<IDiscoveredChange>,
        changedFile: string,
    ) {
        const relative = changedFile.substr(this.root.length);
        let offset = 0;
        if (relative[0] === path.sep) {
            offset = 1;
        }
        const dirEnd = relative.indexOf(path.sep, offset);
        const rootDir = relative.substr(0, dirEnd);
        const fullPath = path.join(this.root, rootDir);

        if (rootDir === "") {
            iterable.notify({
                media: this.createRootMedia(changedFile),
                type: changeType,
            });
            return;
        }

        debug("check for changed media in: ", rootDir, "(", fullPath, ")");

        try {
            for await (const m of this.discoverFromRoot(lastMap, fullPath)) {
                debug("media changed", m);
                lastMap[m.id] = m;
                iterable.notify({
                    media: m,
                    type: ChangeType.MEDIA_CHANGED,
                });
            }
        } catch (e) {
            if (!e.message.includes("ENOENT")) {
                // if ENOENT we're probably trying to scan a directory
                // that was just recursively deleted
                throw e;
            } else {
                debug("NOENT at", fullPath);
            }
        }

        debug("Done", rootDir, "(", fullPath, ")");
    }
}
