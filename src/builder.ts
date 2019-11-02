import fs from "fs-extra";
import path from "path";

import { IDiscovery } from "./discover/base";
import { CompositeDiscovery } from "./discover/composite";
import { LocalDiscovery } from "./discover/local";
import { IMatcher } from "./match";
import { DefaultMatcher } from "./match/default";
import { PhoneticMatcher } from "./match/phonetic";
import { resolvePath } from "./media/util";
import { IQueryable } from "./model";
import { IPlayer } from "./playback/player";
import { ChromecastPlayer } from "./playback/player/chromecast";
import { BabblingQueryable } from "./queryables/babbling";
import { ContextQueryable } from "./queryables/context";
import { RpcServer } from "./rpc/server";
import { Shougun } from "./shougun";
import { ITracker } from "./track/base";
import { IStorage, PersistentTracker } from "./track/persistent";
import { Sqlite3Storage } from "./track/storage/sqlite3";
import { TracklessTracker } from "./track/trackless";

interface IBabblingConfig {
    configPath?: string;
    deviceName?: string;
}

// tslint:disable-next-line no-empty-interface
interface IRemoteConfig {
    // TODO ?
}

export class ShougunBuilder {

    private discoveries: IDiscovery[] = [];
    private matcher: IMatcher | undefined;
    private player: IPlayer | undefined;
    private tracker: ITracker | undefined;
    private babblingConfig: IBabblingConfig | undefined;
    private remoteConfig: IRemoteConfig | undefined;

    private verifyWritePaths: string[] = [];

    private chromecastDeviceName: string | undefined;

    /*
     * Discovery
     */

    public scanFolder(folderPath: string) {
        this.discoveries.push(
            new LocalDiscovery(resolvePath(folderPath)),
        );
        return this;
    }

    public includeBabblingMedia(config: IBabblingConfig = {}) {
        this.babblingConfig = config;
        return this;
    }

    /*
     * Matching
     */

    public matchByPhonetics() {
        return this.matchWith(new PhoneticMatcher());
    }

    public matchWith(matcher: IMatcher) {
        this.matcher = matcher;
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

        this.chromecastDeviceName = deviceName;
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
     * Remote access
     */

    /**
     * Enable shougun CLI remote
     */
    public enableRemote() {
        this.remoteConfig = {};
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

        const matcher = this.matcher || new DefaultMatcher();

        const queryables: IQueryable[] = [
            // always include the base ContextQueryable
            new ContextQueryable(),
        ];

        if (this.babblingConfig) {
            queryables.push(this.createBabblingQueryable());
        }

        const shougun = await Shougun.create(
            queryables,
            discovery,
            matcher,
            this.player,
            this.tracker,
        );

        if (this.remoteConfig) {
            const rpc = new RpcServer(shougun);
            rpc.start();
        }

        return shougun;
    }

    /*
     * Internal utils
     */

    /** @hide */
    private createBabblingQueryable(): IQueryable {
        if (!this.babblingConfig) throw new Error();

        const deviceName = this.babblingConfig.deviceName
            || this.chromecastDeviceName;
        if (!deviceName) {
            throw new Error("If not normally playing on a chromecast device, you must explicitly specify the deviceName to use with Babbling");
        }

        return new BabblingQueryable(
            this.babblingConfig.configPath,
            deviceName,
        );
    }
}
