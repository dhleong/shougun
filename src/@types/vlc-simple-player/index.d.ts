/// <reference types="node" />

declare module "vlc-simple-player" {
    import { ChildProcess } from "child_process";

    export default class Vlc {
        public process: ChildProcess;

        // tslint:disable-next-line variable-name
        public _interval: NodeJS.Timeout;

        constructor(
            path: string,
            options?: {
                arguments?: string[];
                password?: string;
                port?: number;
            },
        );

        public on(event: "error", handler: (stderr: string) => void): void;
        public on(
            event: "statuschange",
            handler: (
                e: Error | null,
                event?: {
                    fullscreen: boolean;
                    stats: any;

                    /** Current playback time, in seconds */
                    time: number;

                    /** Length of the video, in seconds */
                    length: number;

                    state: "playing" | "paused";
                },
            ) => void,
        ): void;

        public quit(): void;
    }
}
