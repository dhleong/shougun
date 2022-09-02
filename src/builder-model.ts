import { BorrowMode } from "./borrow/model";
import { IMatcher } from "./match";
import { IPlayer } from "./playback/player";
import { IRemoteConfig } from "./rpc/server";
import { Shougun } from "./shougun";
import { IStorage } from "./track/persistent";

export interface IEmptyBuilder {
    playOnNamedChromecast(deviceName: string): IBuilderWithChromecast;
    playOnVlc(): IBuilderWithPlayer;
    playOn(player: IPlayer): IBuilderWithPlayer;
}

/*
 * After player selection, discovery
 */

export interface IBuilderWithPlayer {
    scanFolder(folderPath: string): this & IBuilderWithDiscovery;
}

export interface IBabblingConfig {
    configPath?: string;
    deviceName?: string;
}

export interface IBuilderWithChromecast extends IBuilderWithPlayer {
    includeBabblingMedia(
        config?: IBabblingConfig,
    ): IBuilderWithPlayer & IBuilderWithDiscovery;
}

/*
 * After discovery, tracking
 */

export interface IBuilderWithDiscovery {
    dontTrack(): IConfiguredBuilder & OptionalConfig;
    trackInSqlite(databasePath: string): IConfiguredBuilder & OptionalConfig;
    trackWithStorage(storage: IStorage): IConfiguredBuilder & OptionalConfig;
}

/*
 * After tracking, it can be built (plus also some other config)
 */

// NOTE: this isn't quite perfect (doing one after the other will
// include functions from the first again + build) but it's okay
// Future typescript releases might also fix it

//
// match mode:

interface IMatchBuilderConfig {
    matchByPhonetics(): Omit<this, keyof IMatchBuilderConfig>;
    matchWith(matcher: IMatcher): Omit<this, keyof IMatchBuilderConfig>;
}

//
// remote config:

export type OptionalExtraRemoteBuilder<T> = T extends { borrowing: BorrowMode }
    ? Record<string, never>
    : IExtraRemoteBuilderConfig;

interface IRemoteBuilderConfig {
    enableRemote(
        config?: Omit<IRemoteConfig, "borrowing">,
    ): Omit<this, keyof IRemoteBuilderConfig> &
        OptionalExtraRemoteBuilder<typeof config>;

    enableRemote(
        config: IRemoteConfig & { borrowing: BorrowMode },
    ): Omit<this, keyof IRemoteBuilderConfig>;
}

export interface IExtraRemoteBuilderConfig {
    enableBorrowerMode(): Omit<this, keyof IExtraRemoteBuilderConfig>;
    enableLenderMode(): Omit<this, keyof IExtraRemoteBuilderConfig>;
}

//
// misc optioanl config:

export interface IMiscConfig {
    /**
     * By default, Shougun will try to avoid keeping the NodeJS process
     * alive, but it can be more efficient about certain things if it
     * knows it is allowed to keep the process alive.
     *
     * Some other configs imply this setting, such as [enableRemote()]
     */
    allowProcessKeepalive(): this;
}

//
// composite of all optionals:

type OptionalConfig = IMatchBuilderConfig & IRemoteBuilderConfig & IMiscConfig;

//
// configured:

export interface IConfiguredBuilder {
    build(): Promise<Shougun>;
}
