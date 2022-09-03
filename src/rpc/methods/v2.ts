import { v4 as uuid } from "uuid";

import { IMedia } from "../../model";
import type { Shougun, IQueryOpts as ShougunQueryOpts } from "../../shougun";
import type { Connection } from "../msgpack";
import type { IRemoteConfig } from "../server";
import { composeMethods } from "./types";
import {
    DEFAULT_RESULTS,
    IQueryOpts as IQueryOptsV1,
    MAX_RESULTS,
    RpcMethodsV1,
} from "./v1";

export interface IQueryOpts extends IQueryOptsV1 {
    cursor?: string;
}

function generateCursorId() {
    return uuid();
}

async function takeFromCursor(count: number, cursor: AsyncIterator<IMedia>) {
    const items = [];
    for (let i = 0; i < count; ++i) {
        const item = await cursor.next();
        if (item.done) {
            break;
        }
        items.push(item.value);
    }
    return items;
}

export class RpcMethodsV2 {
    private cursors: { [cursor: string]: AsyncIterator<IMedia> } = {};

    constructor(
        protected readonly connection: Connection,
        protected readonly shougun: Shougun,
        protected readonly config: IRemoteConfig,
    ) {}

    // TODO findMedia

    public async queryRecent(
        options: ShougunQueryOpts & Partial<IQueryOpts> = {},
    ) {
        return this._queryVia(options, (opts) =>
            this.shougun.queryRecent(opts),
        );
    }

    public async queryRecommended(
        options: ShougunQueryOpts & Partial<IQueryOpts> = {},
    ) {
        return this._queryVia(options, (opts) =>
            this.shougun.queryRecommended(opts),
        );
    }

    /* NOTE: methods prefixed by _ are not exposed to RPC clients */

    private async _queryVia(
        options: ShougunQueryOpts & Partial<IQueryOpts>,
        queryMethod: (options: ShougunQueryOpts) => AsyncIterable<IMedia>,
    ) {
        const opts = {
            maxResults: DEFAULT_RESULTS,
            ...options,
        };

        const limit = Math.min(opts.maxResults, MAX_RESULTS);

        // Record errors:
        const errors: { [provider: string]: string } = {};
        const onProviderError = (provider: string, error: Error) => {
            console.log("ERROR");
            errors[provider] = error.message;
        };

        // Perform the query for a new request, or fetch the cursor if requested
        const cursor =
            opts.cursor != null
                ? this.cursors[opts.cursor]
                : queryMethod({
                      ...options,
                      onProviderError,
                  })[Symbol.asyncIterator]();

        // Read the items and determine if we should keep the cursor around
        const items = cursor == null ? [] : await takeFromCursor(limit, cursor);
        const newCursor =
            items.length === limit
                ? opts.cursor ?? generateCursorId()
                : undefined;

        // Stash or delete the cursor, as appropriate
        if (newCursor != null) {
            this.cursors[newCursor] = cursor;
        } else if (opts.cursor != null && opts.cursor in this.cursors) {
            delete this.cursors[opts.cursor];
        }

        // Tada!
        return {
            items,
            cursor: newCursor,
            errors: Object.keys(errors).length === 0 ? undefined : errors,
        };
    }
}

export default composeMethods(RpcMethodsV1, RpcMethodsV2);
