import { Server } from "node-ssdp";

export class RpcAnnouncer {
    private server: Server | undefined;

    public start(serverPort: number) {
        if (this.server) {
            throw new Error("Already started");
        }

        const server = new Server({
            location: {
                path: "/",
                port: serverPort,
            },
        });
        server.addUSN("urn:schemas:service:ShougunServer:1");
        server.start();
        this.server = server;
    }

    public stop() {
        if (!this.server) return;
        this.server.stop();
    }
}
