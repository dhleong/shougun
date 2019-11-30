import _debug from "debug";
const debug = _debug("shougun:rpc:server");

import { createServer } from "msgpack-rpc-lite";
import net from "net";

import { Shougun } from "../shougun";

import { RpcAnnouncer } from "./announce";
import { RpcHandler } from "./handler";

import { loadTakeout } from "../takeout/loader";
import { TakeoutMode } from "../takeout/model";

function on(
    server: net.Server,
    event: string,
    handler: (... params: any[]) => Promise<any>,
) {
    server.on(event, ([params]: any[], callback: any) => {
        debug("received:", event, "with", params);
        handler(...params).then(result => {
            callback(null, result);
        }, error => {
            callback(error);
        });
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
     * Takeout options
     */

    takeout?: TakeoutMode;
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

        if (this.config.takeout === TakeoutMode.ENABLE_LOADING) {
            await loadTakeout(this.shougun);
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
                serverPort: port,
                takeout: this.config.takeout,
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
