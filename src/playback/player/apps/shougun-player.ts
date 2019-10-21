import { IDevice } from "babbling";

import { GenericMediaReceiverApp } from "./generic";

export class ShougunPlayerApp extends GenericMediaReceiverApp {
    constructor(device: IDevice) {
        super(device, {
            appId: "81066132", // dev ID
        });
    }

}
