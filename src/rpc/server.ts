import _debug from "debug";

import net from "net";

import { Shougun } from "../shougun";

import { RpcAnnouncer } from "./announce";
import { loadLoans } from "../borrow/loader";
import { BorrowMode } from "../borrow/model";
import { createPublishedMethodsConnectionHandler } from "./msgpack";
import VersionNegotiatorFactory from "./methods/VersionNegotiatorFactory";

const debug = _debug("shougun:rpc:server");

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

    private readonly versionNegotiatorFactory: VersionNegotiatorFactory;
    private readonly handleSocket: (socket: net.Socket) => void;

    constructor(
        private readonly shougun: Shougun,
        private readonly config: IRemoteConfig,
    ) {
        this.versionNegotiatorFactory = new VersionNegotiatorFactory(
            shougun,
            config,
        );
        this.handleSocket = createPublishedMethodsConnectionHandler(
            (connection) => this.versionNegotiatorFactory.create(connection),
        );
    }

    public async start() {
        const server = net.createServer();

        if (this.config.borrowing === BorrowMode.BORROWER) {
            await loadLoans(this.shougun);
        }

        debug("start listening on", this.config.port);
        const address = await new Promise<string | net.AddressInfo | null>(
            (resolve) => {
                server.listen(this.config.port, () => {
                    const addr = server.address();
                    debug("listening on", addr);

                    resolve(addr);
                });
            },
        );

        let port = 0;
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
                versionRange: this.versionNegotiatorFactory.versionRange,
            });
        } catch (e) {
            server.close();
            throw e;
        }

        server.on("error", (error) => {
            debug("Unexpected error:", error);
        });

        server.on("connection", (socket) => {
            this.handleSocket(socket);

            // Track active connections so we can keep the server alive if they want to
            // fetch local cover art
            const id = JSON.stringify(socket.address());
            this.shougun.context.server.addActiveClient(id);
            debug("new client:", id);

            socket.on("error", (error) => {
                debug("Error from client", id, error);
            });

            socket.once("close", () => {
                debug("lost client:", id);
                this.shougun.context.server.removeActiveClient(id);
            });
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
