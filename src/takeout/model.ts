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
