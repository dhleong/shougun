import { IDevice } from "babbling";

import { GenericMediaReceiverApp } from "./generic";

const DEV_ID = "81066132";
const PROD_ID = "D85F931E";

export class ShougunPlayerApp extends GenericMediaReceiverApp {
    constructor(device: IDevice) {
        super(device, {
            appId: process.env.DEBUG && process.env.DEBUG.includes("shougun:cast:dev")
                ? DEV_ID
                : PROD_ID,
        });
    }
}
