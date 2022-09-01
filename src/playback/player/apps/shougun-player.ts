import _debug from "debug";

import type { ChromecastDevice, StratoChannel } from "stratocaster";

import { formatError } from "../../player";
import { GenericMediaReceiverApp } from "./generic";

const debug = _debug("shougun:player:chromecast:app");

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

    return PROD_ID;
}

/**
 * Safely sends the [message] on the given channel without waiting on any response
 */
async function dispatch(s: StratoChannel, message: Record<string, unknown>) {
    // NOTE: This function is async to allow for a more intuitive API (and in case
    // we ever need to wait for *something* but we intentionally do not actually
    // await the result of the send() here:
    s.send(message).catch((e) => debug("Error dispatching message", message));
}

export class ShougunPlayerApp extends GenericMediaReceiverApp {
    constructor(device: ChromecastDevice) {
        super(device, {
            appId: shougunAppId(),
        });
    }

    public async showRecommendations(recommendations: IRecommendation[]) {
        const s = await this.joinOrRunNamespace(CUSTOM_NS);
        await dispatch(s, {
            type: "RECOMMEND",

            recommendations,
        });
        this.device.close(); // don't hang around
    }

    public async showError(error: Error, details?: string) {
        const s = await this.joinOrRunNamespace(CUSTOM_NS);
        await dispatch(s, {
            type: "ERROR",

            error: formatError(error, details),
        });
        this.device.close(); // don't hang around

        return new Promise((resolve) => {
            setTimeout(resolve, 1000);
        });
    }
}
