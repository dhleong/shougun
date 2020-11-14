import { ChromecastDevice } from "stratocaster";

import { GenericMediaReceiverApp } from "./generic";

export class DefaultMediaReceiverApp extends GenericMediaReceiverApp {
    constructor(device: ChromecastDevice) {
        super(device, {
            appId: "CC1AD845",
        });
    }
}
