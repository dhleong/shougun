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

        const node = process.version.substr(1);
        const { serverPort, version } = config;

        const server = new Server({
            allowWildcards: true,
            location: {
                path: "/",
                port: serverPort,
            },
            ssdpSig: `node/${node} shougun:rpc:${version}`,
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
