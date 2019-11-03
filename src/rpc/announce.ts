import { Server } from "node-ssdp";

export class RpcAnnouncer {
    private server: Server | undefined;

    public start(config: {
        serverPort: number,
        version: number,
    }) {
        if (this.server) {
            throw new Error("Already started");
        }

        const sig = `node/${process.version.substr(1)} shougun:rpc:${config.version}`;
        const server = new Server({
            allowWildcards: true,
            location: {
                path: "/",
                port: config.serverPort,
            },
            ssdpSig: sig,
        });
        server.addUSN(`urn:schemas:service:ShougunServer:${config.version}`);
        server.start();
        this.server = server;
    }

    public stop() {
        if (!this.server) return;
        this.server.stop();
    }
}
