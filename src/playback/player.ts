import { Context } from "../context";
import { IAudioTrack, IVideoAnalysis, IVideoTrack } from "../media/analyze";
import { IMedia, IPlayable, IMediaPrefs } from "../model";

export interface IPlaybackOptions {
    /**
     * In *seconds*
     */
    currentTime?: number;

    /**
     * If provided, gets merged onto any prefs set for the media
     */
    prefs?: IMediaPrefs;

    /**
     * Callback to be notified of the User's playback time,
     * in seconds.
     */
    onPlayerPaused?: (
        media: IMedia,
        currentTimeSeconds: number,
    ) => Promise<void>;
}

export interface IPlayerCapabilities {
    supportsLocalPlayback?: boolean;

    supportsAudioTrack(track: IAudioTrack): boolean;
    supportsVideoTrack(track: IVideoTrack): boolean;
    supportsContainer(container: string): boolean;
    supportsNonDefaultAudioTrackForContainer?(container: string): boolean;
    supportsPixelFormat?(format: string): boolean;
}

export interface IPlayer {
    getCapabilities(): Promise<IPlayerCapabilities>;

    play(
        context: Context,
        playable: IPlayable,
        options?: IPlaybackOptions,
    ): Promise<void>;

    showError?(error: Error, details?: string): Promise<void>;

    showRecommendations?(
        context: Context,
        recommendations: Promise<IMedia[]>,
    ): Promise<void>;
}

export function formatError(error: Error, details?: string) {
    const messageParts = (error.stack || error.message).split("\n");

    const errorJson: {
        details?: string;
        message: string;
        stack?: string[];
    } = {
        details,
        message: messageParts[0],
    };

    const stack: string[] = messageParts.slice(1);

    if (stack.length) {
        errorJson.stack = stack;
    }

    return errorJson;
}

export function canPlayNatively(
    capabilities: IPlayerCapabilities,
    analysis: IVideoAnalysis | null,
) {
    if (!analysis) return false; // assume no, I guess

    const videoSupported = capabilities.supportsVideoTrack(analysis.video);
    const audioSupported = capabilities.supportsAudioTrack(analysis.audio);
    const containerSupported = !!analysis.container.find(
        capabilities.supportsContainer.bind(capabilities),
    );

    if (
        audioSupported &&
        !analysis.audio.isDefault &&
        !canPlayNonDefaultAudioTrack(capabilities, analysis)
    ) {
        // we've selected a non-default audio track, but the player
        // doesn't support doing that with this container natively
        return false;
    }

    return videoSupported && audioSupported && containerSupported;
}

function canPlayNonDefaultAudioTrack(
    capabilities: IPlayerCapabilities,
    analysis: IVideoAnalysis,
) {
    if (!capabilities.supportsNonDefaultAudioTrackForContainer) {
        // it doesn't support for any container
        return false;
    }

    return !!analysis.container.find(
        capabilities.supportsNonDefaultAudioTrackForContainer.bind(
            capabilities,
        ),
    );
}
