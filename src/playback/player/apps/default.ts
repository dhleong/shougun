import { IDevice } from "babbling";

import { GenericMediaReceiverApp } from "./generic";

export class DefaultMediaReceiverApp extends GenericMediaReceiverApp {
    constructor(device: IDevice) {
        super(device, {
            appId: "CC1AD845",
        });
    }
}
