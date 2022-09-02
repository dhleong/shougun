import type { Shougun } from "../../shougun";
import type { Connection } from "../msgpack";
import type { IRemoteConfig } from "../server";
import { composeMethods } from "./types";
import { IQueryOpts, queryVia, RpcMethodsV1 } from "./v1";

export class RpcMethodsV2 {
    constructor(
        protected readonly connection: Connection,
        protected readonly shougun: Shougun,
        protected readonly config: IRemoteConfig,
    ) {}

    public async queryRecent(
        options: { onlyLocal?: boolean | undefined } & Partial<IQueryOpts>,
    ) {
        const items = await queryVia(
            this.shougun,
            options,
            this.shougun.queryRecent(options),
        );
        return {
            items,
        };
    }
}

export default composeMethods(RpcMethodsV1, RpcMethodsV2);
