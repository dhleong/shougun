export enum TakeoutMode {
    /**
     * Allow takeout requests to be made via RPC
     */
    ALLOW_REQUESTS,

    /**
     * Enable takeout instruction loading
     */
    ENABLE_LOADING,
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
    token: string;

    nextMedia: ITakeoutInstruction[];
}
