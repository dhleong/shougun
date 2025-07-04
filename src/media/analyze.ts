import _debug from "debug";

import {
    ffprobe as ffprobeCallback,
    FfprobeData,
    FfprobeStream,
} from "fluent-ffmpeg";
import { languageCodeMatches } from "../util/language";

const debug = _debug("shougun:analyze");

const ffprobe = (localPath: string) =>
    new Promise<FfprobeData>((resolve, reject) => {
        ffprobeCallback(localPath, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });

export interface IAudioTrack {
    id?: string;
    index: number;
    channels?: number;
    codec: string;
    isDefault: boolean;
    language?: string;
    profile?: string;
}

export interface ITextTrack {
    codec: string;
    index: number;
    isDefault: boolean;
    isForced: boolean;
    isHearingImpared: boolean;
    language?: string;
}

export interface IVideoTrack {
    index: number;

    codec: string;
    fps?: number;

    /** eg: 153 for 5.1 on hevc; 41 for 4.1 on h264 */
    level?: number;

    /**
     * level, but normalized to be an integer, similar to
     * how level 4.1 gets reported as 41 for h264
     *
     * eg: 51 (if `level` was 153, for hevc)
     */
    levelNormalized?: number;

    colorSpace?: string;
    pixelFormat?: string;
    profile?: string;

    width: number;
    height: number;
}

export interface IVideoAnalysis {
    audio: IAudioTrack;
    video: IVideoTrack;
    subtitles: ITextTrack[];

    container: string[];
    duration: number;
}

function requireNotNull<T>(v: T): NonNullable<T> {
    if (v == null) {
        throw new Error("Object was unexpectedly nil");
    }
    return v as unknown as any;
}

function requireNotNullProp<T, K extends keyof T>(
    v: T,
    key: K,
): NonNullable<T[K]> {
    if (v[key] == null) {
        throw new Error(
            `Property ${String(key)} of object was unexpectedly nil`,
        );
    }
    return v[key] as unknown as any;
}

function parseAudioTrack(s: FfprobeStream): IAudioTrack {
    return {
        id: s.id,
        index: s.index,
        channels: s.channels,
        codec: requireNotNullProp(s, "codec_name"),
        language: s.tags?.language,
        profile: s.profile as unknown as string,
        isDefault: (s.disposition?.default ?? 0) > 0,
    };
}

function parseVideoTrack(s: FfprobeStream): IVideoTrack {
    const [fpsNum, fpsDen] = (s.avg_frame_rate || "0/1").split("/");
    const base: IVideoTrack = {
        index: s.index,

        codec: requireNotNullProp(s, "codec_name"),
        colorSpace: s.color_space,
        fps: parseInt(fpsNum, 10) / parseInt(fpsDen, 10),
        pixelFormat: s.pix_fmt,

        // I think these types got flipped:
        level: s.level as unknown as number,
        profile: s.profile as unknown as string,

        height: requireNotNullProp(s, "height"),
        width: requireNotNullProp(s, "width"),
    };

    if (base.level) {
        switch (base.codec) {
            case "h264":
                base.levelNormalized = base.level;
                break;

            case "hevc":
                // general_level_idc: level is actually `level * 30` for hevc
                // we divide by 3 to get eg 51 for simpler comparisons
                base.levelNormalized = base.level / 3;
                break;
        }
    }

    return base;
}

function parseTextTrack(s: FfprobeStream): ITextTrack | undefined {
    const language = s.tags?.language;
    if (!language) return;

    debug("parse text track", s);
    return {
        index: s.index,
        language,
        codec: s.codec_name ?? "<unknown>",
        isDefault: !!s.disposition?.default,
        isForced: !!s.disposition?.forced,
        isHearingImpared: !!s.disposition?.hearing_impaired,
    };
}

export async function analyzeFile(
    localPath: string,
    opts?: {
        preferredAudioLanguage?: string;
    },
) {
    const data = await ffprobe(localPath);

    let videoTrack: IVideoTrack | undefined;
    let audioTrack: IAudioTrack | undefined;
    let defaultAudioTrack: IAudioTrack | undefined;
    const subtitles: ITextTrack[] = [];

    for (const s of data.streams) {
        if (!videoTrack && s.codec_type === "video") {
            videoTrack = parseVideoTrack(s);
        }

        if (!audioTrack && s.codec_type === "audio") {
            const parsed = parseAudioTrack(s);
            if (!defaultAudioTrack || parsed.isDefault) {
                // pick a reasonable default/fallback
                defaultAudioTrack = parsed;
            }

            // is this "the one"?
            if (
                !opts?.preferredAudioLanguage ||
                languageCodeMatches(
                    parsed.language ?? "",
                    opts.preferredAudioLanguage,
                )
            ) {
                audioTrack = parsed;
            }
        }

        if (s.codec_type === "subtitle") {
            const parsed = parseTextTrack(s);
            if (parsed) {
                debug("found subtitle", parsed);
                subtitles.push(parsed);
            }
        }
    }

    // couldn't find the requested track; fallback to the default
    if (!audioTrack) audioTrack = defaultAudioTrack;

    return {
        audio: requireNotNull(audioTrack),
        video: requireNotNull(videoTrack),
        subtitles,

        container: requireNotNullProp(data.format, "format_name").split(","),
        duration: data.format.duration,
    } as IVideoAnalysis;
}
