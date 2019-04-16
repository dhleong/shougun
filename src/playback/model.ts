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
