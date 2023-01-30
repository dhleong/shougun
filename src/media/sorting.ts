import { IMedia } from "../model";
import { IRecentMedia } from "../track/base";

export function createCompareByRecencyData(
    recencyData: Partial<Record<string, IRecentMedia>>,
) {
    return (a: IMedia, b: IMedia) => {
        const aViewedAt = recencyData[a.id]?.lastViewedTimestamp;
        const bViewedAt = recencyData[b.id]?.lastViewedTimestamp;

        if (aViewedAt == null && bViewedAt == null) {
            return 0;
        }
        if (aViewedAt == null) {
            // Only b has been viewed; it should get priority
            return 1;
        }
        if (bViewedAt == null) {
            // Only a has been viewed; it should get priority
            return -1;
        }

        return bViewedAt - aViewedAt;
    };
}
