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
    codec: string;
    profile?: string;
}

export interface IVideoTrack {
    codec: string;
    fps?: number;
    level?: number;
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
        codec: s.codec_name!,
        profile: s.profile as unknown as string,
    };
}

function parseVideoTrack(s: FfprobeStream): IVideoTrack {
    const [ fpsNum, fpsDen ] = (s.avg_frame_rate || "0/1").split("/");
    return {
        codec: s.codec_name!,
        fps: parseInt(fpsNum, 10) / parseInt(fpsDen, 10),
        pixelFormat: s.pix_fmt,

        // I think these types got flipped:
        level: s.level as unknown as number,
        profile: s.profile as unknown as string,

        height: s.height!,
        width: s.width!,
    };
}
