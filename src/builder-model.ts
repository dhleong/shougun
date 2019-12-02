import { IMatcher } from "./match";
import { IPlayer } from "./playback/player";
import { IRemoteConfig } from "./rpc/server";
import { Shougun } from "./shougun";
import { IStorage } from "./track/persistent";

export interface IEmptyBuilder {
    playOnNamedChromecast(deviceName: string): IBuilderWithChromecast;
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
    includeBabblingMedia(config?: IBabblingConfig): IBuilderWithPlayer & IBuilderWithDiscovery;
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

interface IMatchBuilderConfig {
    matchByPhonetics(): Omit<this, keyof IMatchBuilderConfig>;
    matchWith(matcher: IMatcher): Omit<this, keyof IMatchBuilderConfig>;
}

interface IRemoteBuilderConfig {
    enableRemote(config?: IRemoteConfig): Omit<this, keyof IRemoteBuilderConfig>;
}

type OptionalConfig =
    IMatchBuilderConfig
    & IRemoteBuilderConfig;

export interface IConfiguredBuilder {
    build(): Promise<Shougun>;
}
