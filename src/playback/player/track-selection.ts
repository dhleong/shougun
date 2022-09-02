import { languageCodeMatches } from "../../util/language";
import type { ICastTrack, ILoadParams } from "./apps/generic";

export function findDefaultAudio(tracks: ICastTrack[]) {
    for (const track of tracks) {
        if (track.type === "AUDIO") {
            return track.customData;
        }
    }
}

export function pickDefaultTrackIds(params: ILoadParams) {
    if (!params.media.tracks || !params.media.tracks.length) {
        // No tracks; don't bother
        return;
    }

    const { preferredSubtitleLanguage } = params;
    if (preferredSubtitleLanguage != null) {
        // If we have a preferred subtitle language, try to honor it
        const preferred = params.media.tracks.find(
            (track) =>
                track.language &&
                languageCodeMatches(track.language, preferredSubtitleLanguage),
        );
        if (preferred) {
            return [preferred.trackId];
        }
    }

    // Try to honor a "forced" subtitle track. These should be enabled by
    // default if the subtitle language matches the selected audio language
    // *and* the subtitle has the "isForced" flag.
    const audio = findDefaultAudio(params.media.tracks);
    if (!audio) {
        // Unlikely, but...
        return;
    }

    for (const track of params.media.tracks) {
        if (track.type !== "TEXT") continue;

        if (track.customData.isForced && track.language === audio.language) {
            return [track.trackId];
        }
    }
}
