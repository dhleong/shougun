import _debug from "debug";
const debug = _debug("shougun:rpc:server");

import { createServer } from "msgpack-rpc-lite";
import net from "net";

import { Shougun } from "../shougun";

import { RpcAnnouncer } from "./announce";
import { RpcHandler } from "./handler";

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

export class RpcServer {
    private server: net.Server | undefined;
    private readonly announcer = new RpcAnnouncer();
    private readonly handler: RpcHandler;

    constructor(
        shougun: Shougun,
    ) {
        this.handler = new RpcHandler(shougun);
    }

    public start() {
        const server = createServer();

        registerRpcHandler(server, this.handler);

        server.listen(() => {
            const address = server.address();
            debug("listening on", address);
            if (typeof address === "string") {
                const port = address.split(/:/);
                this.announcer.start(
                    parseInt(port[port.length - 1], 10),
                );
            } else if (address) {
                this.announcer.start(
                    address.port,
                );
            }
        });

        this.server = server;
    }

    public stop() {
        if (this.server) {
            this.server.close();
        }

        this.announcer.stop();
    }

}
