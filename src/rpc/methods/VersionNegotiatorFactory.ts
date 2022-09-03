import type { IRemoteConfig } from "../server";
import type { Shougun } from "../../shougun";
import type { Connection } from "../msgpack";

import { RpcMethodsV1 } from "./v1";
import { RpcMethodsV2 } from "./v2";

export const DEFAULT_VERSION_FACTORIES: {
    [version: number]: new (
        connection: Connection,
        shougun: Shougun,
        config: IRemoteConfig,
    ) => unknown;
} = {
    1: RpcMethodsV1,
    2: RpcMethodsV2,
};

class VersionNegotiator {
    /** The range of supported versions [lowest, highest] */
    public currentDelegate: unknown;

    constructor(
        private readonly versionFactories: typeof DEFAULT_VERSION_FACTORIES,
        private readonly shougun: Shougun,
        private readonly config: IRemoteConfig,
        private readonly connection: Connection,
        private readonly defaultVersion: number,
    ) {
        this.version(this.defaultVersion);
    }

    public version(requestedVersion: number) {
        const Factory = this.versionFactories[requestedVersion];
        if (Factory == null) {
            throw new Error(
                `Requested unsupported version: ${requestedVersion}`,
            );
        }

        this.currentDelegate = new Factory(
            this.connection,
            this.shougun,
            this.config,
        );
    }
}

export default class VersionNegotiatorFactory {
    /** The range of supported versions [lowest, highest] */
    public readonly versionRange: [number, number];

    constructor(
        private readonly shougun: Shougun,
        private readonly config: IRemoteConfig,
        private readonly versionFactories: typeof DEFAULT_VERSION_FACTORIES = DEFAULT_VERSION_FACTORIES,
    ) {
        const allVersions = Object.keys(this.versionFactories)
            .map((v) => parseInt(v, 10))
            .sort();
        this.versionRange = [
            allVersions[0],
            allVersions[allVersions.length - 1],
        ];
    }

    public create(connection: Connection) {
        const versionNegotiator = new VersionNegotiator(
            this.versionFactories,
            this.shougun,
            this.config,
            connection,
            this.versionRange[0],
        );

        return new Proxy(versionNegotiator, {
            get(target, prop) {
                if (prop in target) {
                    return (target as any)[prop];
                }

                return (target.currentDelegate as any)[prop];
            },
        });
    }
}
