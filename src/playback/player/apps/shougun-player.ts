import { IDevice } from "babbling";

import { formatError } from "../../player";
import { GenericMediaReceiverApp } from "./generic";

const DEV_ID = "81066132";
const PROD_ID = "D85F931E";

const CUSTOM_NS = "urn:x-cast:com.github.dhleong.shougun";

export interface IRecommendation {
    cover?: string;
    id: string;
    title: string;
}

function shougunAppId() {
    if (!process.env.DEBUG) return PROD_ID;

    if (process.env.SHOUGUN_APP_ID) {
        return process.env.SHOUGUN_APP_ID;
    }

    if (process.env.DEBUG.includes("shougun:cast:dev")) {
        return DEV_ID;
    }

    return PROD_ID
}

export class ShougunPlayerApp extends GenericMediaReceiverApp {
    constructor(device: IDevice) {
        super(device, {
            appId: shougunAppId(),
        });
    }

    public async showRecommendations(
        recommendations: IRecommendation[],
    ) {
        const s = await this.joinOrRunNamespace(CUSTOM_NS);
        s.send({
            type: "RECOMMEND",

            recommendations,
        });
        this.device.stop(); // don't hang around
    }

    public async showError(
        error: Error,
        details?: string,
    ) {
        const s = await this.joinOrRunNamespace(CUSTOM_NS);
        s.send({
            type: "ERROR",

            error: formatError(error, details),
        });
        this.device.stop(); // don't hang around

        return new Promise(resolve => {
            setTimeout(resolve, 1000);
        });
    }
}
