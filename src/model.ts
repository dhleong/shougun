export interface ILocalMedia {
    id: string;
    contentType: string;
    localPath: string;
}

export interface IMediaMetadata {
    title?: string;
}

export interface IPlayable {
    id: string;
    contentType: string;
    getMetadata(): Promise<IMediaMetadata>;
    getUrl(): Promise<string>;
}

export enum MediaType {
    Episode,
    Movie,
    Season,
    Show,
}

export interface IMedia {
    id: string;
    type: MediaType;

    // TODO maybe we should provide things like an IServer instance, so
    // the Discovery methods don't need a reference up-front
    createPlayable(): Promise<IPlayable>;
}
