import fs from "fs-extra";
import path from "path";

import {
    IBabblingConfig,
    IEmptyBuilder,
    IExtraRemoteBuilderConfig,
} from "./builder-model";

import { BorrowMode } from "./borrow/model";
import { IShougunOpts } from "./context";
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
import { VlcPlayer } from "./playback/player/vlc";
import { BabblingQueryable } from "./queryables/babbling";
import { ContextQueryable } from "./queryables/context";
import { IRemoteConfig, RpcServer } from "./rpc/server";
import { Shougun } from "./shougun";
import { ITracker } from "./track/base";
import { IStorage, PersistentTracker } from "./track/persistent";
import { Sqlite3Storage } from "./track/storage/sqlite3";
import { TracklessTracker } from "./track/trackless";

export class ShougunBuilder implements IExtraRemoteBuilderConfig {
    public static create(): IEmptyBuilder {
        return new ShougunBuilder();
    }

    private discoveries: IDiscovery[] = [];
    private matcher: IMatcher | undefined;
    private player: IPlayer | undefined;
    private tracker: ITracker | undefined;
    private babblingConfig: IBabblingConfig | undefined;
    private remoteConfig: IRemoteConfig | undefined;

    private verifyWritePaths: string[] = [];
    private opts: IShougunOpts = {};

    private chromecastDeviceName: string | undefined;

    private constructor() {}

    /*
     * Discovery
     */

    public scanFolder(folderPath: string): this {
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
        this.chromecastDeviceName = deviceName;
        return this.playOn(
            ChromecastPlayer.forNamedDevice(deviceName),
        );
    }

    public playOnVlc() {
        return this.playOn(new VlcPlayer());
    }

    public playOn(player: IPlayer) {
        if (this.player) {
            // TODO does it make sense to ever have >1?
            throw new Error("Only one Player allowed");
        }

        this.player = player;
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
    public enableRemote(config: IRemoteConfig = {}) {
        this.remoteConfig = config;
        this.opts.allowProcessKeepalive = true;
        return this;
    }

    public enableBorrowerMode() {
        this.remoteConfig = {
            ...this.remoteConfig,

            borrowing: BorrowMode.BORROWER,
        };
        return this;
    }

    public enableLenderMode() {
        this.remoteConfig = {
            ...this.remoteConfig,

            borrowing: BorrowMode.LENDER,
        };
        return this;
    }

    /*
     * Misc
     */

    public allowProcessKeepalive() {
        this.opts.allowProcessKeepalive = true;
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
            this.opts,
        );

        if (this.remoteConfig) {
            const rpc = new RpcServer(shougun, this.remoteConfig);
            await rpc.start();
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
