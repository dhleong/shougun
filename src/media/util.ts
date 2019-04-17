import mime from "mime";

export function fileNameToTitle(name: string) {
    return name; // TODO
}

export function isVideo(fileName: string) {
    const type = mime.getType(fileName);
    if (!type) return false;
    return type.startsWith("video");
}
