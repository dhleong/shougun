import { RpcHandler } from "../handler";
import type { IRemoteConfig } from "../server";
import type { Shougun } from "../../shougun";
import type { Connection } from "../msgpack";

const versionFactories: {
    [version: number]: (
        connection: Connection,
        shougun: Shougun,
        config: IRemoteConfig,
    ) => unknown;
} = {
    1: (_, shougun, config) => new RpcHandler(shougun, config),
};

class VersionNegotiator {
    /** The range of supported versions [lowest, highest] */
    public currentDelegate: unknown;

    constructor(
        private readonly connection: Connection,
        private readonly shougun: Shougun,
        private readonly config: IRemoteConfig,
        private readonly defaultVersion: number,
    ) {
        this.version(this.defaultVersion);
    }

    public version(requestedVersion: number) {
        const factory = versionFactories[requestedVersion];
        if (factory == null) {
            throw new Error(
                `Requested unsupported version: ${requestedVersion}`,
            );
        }

        this.currentDelegate = factory(
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
    ) {
        const allVersions = Object.keys(versionFactories)
            .map((v) => parseInt(v, 10))
            .sort();
        this.versionRange = [
            allVersions[0],
            allVersions[allVersions.length - 1],
        ];
    }

    public create(connection: Connection) {
        const versionNegotiator = new VersionNegotiator(
            connection,
            this.shougun,
            this.config,
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
