export enum BorrowMode {
    /**
     * Allow borrow requests to be made via RPC
     */
    LENDER = "LENDER",

    /**
     * Enable loan instruction loading
     */
    BORROWER = "BORROWER",
}

export interface IBorrowRequest {
    episodes: number;
    seriesId: string;
}

export interface ILoanInstruction {
    id: string;
    resumeTimeSeconds?: number;
}

export interface ILoanInstructions {
    nextMedia: ILoanInstruction[];
    serverId: string;
    token: string;
}
