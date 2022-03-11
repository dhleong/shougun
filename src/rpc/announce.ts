import _debug from "debug";
const debug = _debug("shougun:rpc:announce");

import os from "os";
import pathlib from "path";

import fsextra from "fs-extra";
import { Server } from "node-ssdp";

import { BorrowMode } from "../borrow/model";
import { generateMachineUuid } from "./id";

export const LOCAL_ANNOUNCE_PATH = pathlib.join(
    os.homedir(),
    ".config/shougun/announce.port",
);

export class RpcAnnouncer {
    private server: Server | undefined;

    public async start(config: {
        serverPort: number,
        borrowing?: BorrowMode,
        version: number,
    }) {
        if (this.server) {
            throw new Error("Already started");
        }

        const node = process.version.substr(1);
        const { serverPort, version } = config;

        const uuid = await generateMachineUuid();
        const server = new Server({
            allowWildcards: true,
            location: {
                path: "/",
                port: serverPort,
                protocol: "shougun://",
            },
            ssdpSig: `node/${node} shougun:rpc:${version}`,
            suppressRootDeviceAdvertisements: false,
            udn: "uuid:" + uuid,

            headers: {
                BORROWING: config.borrowing,
                SID: uuid,
            },
        });

        server.addUSN(`urn:schemas:service:ShougunServer:${config.version}`);
        if (config.borrowing === BorrowMode.LENDER) {
            server.addUSN(`urn:schemas:service:ShougunLibrary:${config.version}`);
        } else if (config.borrowing === BorrowMode.BORROWER) {
            server.addUSN(`urn:schemas:service:ShougunBorrower:${config.version}`);
        }

        try {
            await server.start();
            this.server = server;
            return;
        } catch (e: any) {
            if (!e.message.includes("No sockets available")) {
                throw e;
            }
        }

        debug("No sockets available; announcing local-only");
        await fsextra.mkdirs(pathlib.dirname(LOCAL_ANNOUNCE_PATH));
        await fsextra.writeFile(LOCAL_ANNOUNCE_PATH, "" + serverPort);

        process.once("exit", () => {
            debug("Clean up local announce");
            fsextra.removeSync(LOCAL_ANNOUNCE_PATH);
        });
    }

    public stop() {
        if (this.server) {
            this.server.stop();
            this.server = undefined;
        }
    }
}
