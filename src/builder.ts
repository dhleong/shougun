import fs from "fs-extra";
import path from "path";

import { IDiscovery } from "./discover/base";
import { CompositeDiscovery } from "./discover/composite";
import { LocalDiscovery } from "./discover/local";
import { resolvePath } from "./media/util";
import { IPlayer } from "./playback/player";
import { ChromecastPlayer } from "./playback/player/chromecast";
import { Shougun } from "./shougun";
import { ITracker } from "./track/base";
import { IStorage, PersistentTracker } from "./track/persistent";
import { Sqlite3Storage } from "./track/storage/sqlite3";
import { TracklessTracker } from "./track/trackless";

export class ShougunBuilder {

    private discoveries: IDiscovery[] = [];
    private player: IPlayer | undefined;
    private tracker: ITracker | undefined;

    private verifyWritePaths: string[] = [];

    /*
     * Discovery
     */

    public scanFolder(folderPath: string) {
        this.discoveries.push(
            new LocalDiscovery(resolvePath(folderPath)),
        );
        return this;
    }

    /*
     * Playback
     */

    public playOnNamedChromecast(deviceName: string) {
        if (this.player) {
            // TODO does it make sense to ever have >1?
            throw new Error("Only one Player allowed");
        }

        this.player = ChromecastPlayer.forNamedDevice(deviceName);
        return this;
    }

    /*
     * Tracking
     */

    public dontTrack() {
        this.tracker = new TracklessTracker();
        return this;
    }

    public trackInSqlite(databasePath: string) {
        const resolved = resolvePath(databasePath);
        this.verifyWritePaths.push(path.dirname(resolved));

        return this.trackWithStorage(
            Sqlite3Storage.forFile(resolved),
        );
    }

    public trackWithStorage(storage: IStorage) {
        this.tracker = new PersistentTracker(storage);
        return this;
    }

    /*
     * Builder
     */

    public async build() {
        if (!this.discoveries.length) {
            throw new Error("No discovery method provided");
        }

        if (!this.player) {
            throw new Error("No playback method provided");
        }

        if (!this.tracker) {
            throw new Error("No watch history tracker provided");
        }

        // ensure all the writePath dirs exist
        await Promise.all(this.verifyWritePaths.map(async p =>
            fs.ensureDir(p),
        ));

        const discovery = this.discoveries.length === 1
            ? this.discoveries[0]
            : CompositeDiscovery.create(...this.discoveries);

        return Shougun.create(
            discovery,
            this.player,
            this.tracker,
        );
    }
}
