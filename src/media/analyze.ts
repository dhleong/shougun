import {
    ffprobe as ffprobeCallback,
    FfprobeData,
    FfprobeStream,
} from "fluent-ffmpeg";

const ffprobe = (localPath: string) => new Promise<FfprobeData>((resolve, reject) => {
    ffprobeCallback(localPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
    });
});

export interface IAudioTrack {
    channels?: number;
    codec: string;
    profile?: string;
}

export interface IVideoTrack {
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

    container: string[];
    duration: number;
}

export async function analyzeFile(
    localPath: string,
) {
    const data = await ffprobe(localPath);

    let videoTrack: IVideoTrack | undefined;
    let audioTrack: IAudioTrack | undefined;
    for (const s of data.streams) {
        if (!videoTrack && s.codec_type === "video") {
            videoTrack = parseVideoTrack(s);
        }

        if (!audioTrack && s.codec_type === "audio") {
            audioTrack = parseAudioTrack(s);
        }

        if (videoTrack && audioTrack) {
            break;
        }
    }

    return {
        audio: audioTrack!,
        video: videoTrack!,

        container: data.format.format_name!.split(","),
        duration: data.format.duration,
    } as IVideoAnalysis;
}

function parseAudioTrack(s: FfprobeStream): IAudioTrack {
    return {
        channels: s.channels,
        codec: s.codec_name!,
        profile: s.profile as unknown as string,
    };
}

function parseVideoTrack(s: FfprobeStream): IVideoTrack {
    const [ fpsNum, fpsDen ] = (s.avg_frame_rate || "0/1").split("/");
    const base: IVideoTrack = {
        codec: s.codec_name!,
        colorSpace: s.color_space,
        fps: parseInt(fpsNum, 10) / parseInt(fpsDen, 10),
        pixelFormat: s.pix_fmt,

        // I think these types got flipped:
        level: s.level as unknown as number,
        profile: s.profile as unknown as string,

        height: s.height!,
        width: s.width!,
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
