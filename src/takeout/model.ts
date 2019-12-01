export enum TakeoutMode {
    /**
     * Allow takeout requests to be made via RPC
     */
    ALLOW_REQUESTS = "ALLOW_REQUESTS",

    /**
     * Enable takeout instruction loading
     */
    ENABLE_LOADING = "ENABLE_LOADING",
}

export interface ITakeoutRequest {
    episodes: number;
    seriesId: string;
}

export interface ITakeoutInstruction {
    id: string;
    resumeTimeSeconds?: number;
}

export interface ITakeoutInstructions {
    nextMedia: ITakeoutInstruction[];
    serverId: string;
    token: string;
}
