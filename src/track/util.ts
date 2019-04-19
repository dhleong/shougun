/**
 * An item can't be considered to have been started
 * unless they've viewed this many seconds
 */
const MinViewingTimestamp = 5;

/**
 * An item is considered "watched" if its viewed
 * *percentage* is at least this much
 */
const MinWatchedPercent = 0.95;

export enum WatchState {
    Unwatched,
    InProgress,
    Watched,
}

export function computeWatchState(
    viewedTimestampSeconds?: number,
    videoDurationSeconds?: number,
) {
    if (!viewedTimestampSeconds || !videoDurationSeconds) {
        // no duration or watched timestamp (including 0s)
        // is obviously unwatched
        return WatchState.Unwatched;
    }

    if (viewedTimestampSeconds < MinViewingTimestamp) {
        return WatchState.Unwatched;
    }

    const watchedPercent = viewedTimestampSeconds / videoDurationSeconds;
    if (watchedPercent < MinWatchedPercent) {
        return WatchState.InProgress;
    }

    return WatchState.Watched;
}
