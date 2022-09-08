import _debug from "debug";

import { DEFAULT_CONFIG_PATH } from "babbling/dist/cli/config";
import fs from "fs/promises";
import { v4 as uuid } from "uuid";

import { IMedia } from "../../model";
import { BabblingQueryable } from "../../queryables/babbling";
import type { Shougun, IQueryOpts as ShougunQueryOpts } from "../../shougun";
import type { Connection } from "../msgpack";
import type { IRemoteConfig } from "../server";
import { composeMethods } from "./types";
import RpcMethodsV1, {
    DEFAULT_RESULTS,
    formatMediaResults,
    IQueryOpts as IQueryOptsV1,
    MAX_RESULTS,
} from "./v1";

const debug = _debug("shougun:rpc:v2");

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

/* eslint-disable no-underscore-dangle */

export class RpcMethodsV2Only {
    private cursors: { [cursor: string]: AsyncIterator<IMedia> } = {};

    constructor(
        protected readonly connection: Connection,
        protected readonly shougun: Shougun,
        protected readonly config: IRemoteConfig,
    ) {}

    public async search(
        query: string,
        options: ShougunQueryOpts & Partial<IQueryOpts> = {},
    ) {
        const { shougun } = this;
        return this._queryVia(options, async function* SearchResults(opts) {
            const results = await shougun.search(query, opts);

            yield* shougun.context.matcher.sort(
                query,
                results,
                (item) => item.title,
            );
        });
    }

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
            items: await formatMediaResults(this.shougun, items),
            cursor: newCursor,
            errors: Object.keys(errors).length === 0 ? undefined : errors,
        };
    }

    public async setBabblingCredentials(
        provider: string,
        creds: Record<string, unknown>,
    ) {
        const queryable = this.shougun.context.queryables.find(
            (candidate) => candidate instanceof BabblingQueryable,
        );
        if (queryable == null) {
            throw new Error("Not configured to use babbling");
        }

        const babbling = queryable as BabblingQueryable;
        const configPath = babbling.configPath ?? DEFAULT_CONFIG_PATH;

        const currentConfig = JSON.parse(
            (await fs.readFile(configPath)).toString(),
        );
        currentConfig[provider] = creds;
        await fs.writeFile(configPath, JSON.stringify(currentConfig, null, 2));
    }

    public subscribeToMediaEvents() {
        const controller = new AbortController();
        const events = this.shougun.context.player.observeMediaEvents?.({
            signal: controller.signal,
        });
        if (events == null) {
            return false;
        }

        (async () => {
            debug("subscribed");
            for await (const event of events) {
                debug("on event");
                this.connection.notify("onMediaEvent", event);
            }
            debug("unsubscribed I guess");
        })();

        this.connection.once("close", () => {
            debug("Unsubscribe from media on disconnect");
            controller.abort();
        });
    }
}

export default composeMethods(RpcMethodsV1, RpcMethodsV2Only);
