import _debug from "debug";
const debug = _debug("shougun:rpc:server");

import { createServer } from "msgpack-rpc-lite";
import net from "net";

import { Shougun } from "../shougun";

import { RpcAnnouncer } from "./announce";
import { RpcHandler } from "./handler";

import { loadLoans } from "../borrow/loader";
import { BorrowMode } from "../borrow/model";

function on(
    server: net.Server,
    event: string,
    handler: (... params: any[]) => Promise<any>,
) {
    server.on(event, ([params]: any[], callback: any) => {
        debug("received:", event, "with", params);
        try {
            handler(...params).then(result => {
                callback(null, result);
            }, error => {
                callback(error);
            });
        } catch (e) {
            // NOTE: This is a sanity check to make sure that errors in a handler
            // don't crash the RPC server
            callback(e);
        }
    });
}

function registerRpcHandler(
    server: net.Server,
    handler: any,
) {
    const prototype = Object.getPrototypeOf(handler);
    for (const eventName of Object.getOwnPropertyNames(prototype)) {
        if (eventName === "constructor") continue;

        const fn = prototype[eventName] as () => Promise<any>;
        if (typeof fn !== "function") {
            continue;
        }

        const m = fn.bind(handler);
        on(server, eventName, m);
        debug("registered event:", eventName);
    }
}

export interface IRemoteConfig {
    port?: number;

    /*
     * Borrowing options
     */

    borrowing?: BorrowMode;
}

export class RpcServer {
    private server: net.Server | undefined;
    private readonly announcer = new RpcAnnouncer();
    private readonly handler: RpcHandler;

    constructor(
        private readonly shougun: Shougun,
        private readonly config: IRemoteConfig,
    ) {
        this.handler = new RpcHandler(shougun, config);
    }

    public async start() {
        const server = createServer();

        if (this.config.borrowing === BorrowMode.BORROWER) {
            await loadLoans(this.shougun);
        }

        registerRpcHandler(server, this.handler);

        debug("start listening on", this.config.port);
        const address = await new Promise<string | net.AddressInfo | null>(resolve => {
            server.listen(this.config.port, () => {
                const addr = server.address();
                debug("listening on", addr);

                resolve(addr);
            });
        });

        let port: number = 0;
        if (typeof address === "string") {
            const raw = address.split(/:/);
            port = parseInt(raw[raw.length - 1], 10);
        } else if (address) {
            port = address.port;
        }

        try {
            await this.announcer.start({
                borrowing: this.config.borrowing,
                serverPort: port,
                version: this.handler.VERSION,
            });
        } catch (e) {
            server.close();
            throw e;
        }

        this.server = server;
    }

    public stop() {
        if (this.server) {
            this.server.close();
        }

        this.announcer.stop();
    }

}
