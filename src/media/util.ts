import mime from "mime";
import slug from "speakingurl";
// import { toLaxTitleCase } from "titlecase";

let toLaxTitleCase: (s: string) => string;

// tslint:disable no-var-requires
const titlecase = require("titlecase");
toLaxTitleCase = titlecase.toLaxTitleCase;

export function nestId(parentId: string, childId: string) {
    return `${parentId}:${childId}`;
}

export function fileNameToId(name: string) {
    return slug(fileNameToTitle(name));
}

export function fileNameToTitle(name: string) {
    if (isVideo(name)) {
        // strip extension
        name = name.substring(0, name.lastIndexOf("."));
    }

    const fixed = name.replace(/[_.]/g, " ")

        // strip format/codec info
        .replace(/(720|1080)p|[0-9]{3,4}x[0-9]{3,4}|x264|aac|mpeg|divx[0-9]*|hevc|[0-9]+bit|xvid(hd)?/gi, "")
        .replace(/(web|hdtv|tv|br|bd)rip/gi, "")

        // this strips parenthesis with irrelevent stuff inside
        .replace(/\(([a-z]{0,3}|[ -]+){0,4}\)/gi, "")

        // brackets are rarely parts of titles
        .replace(/\[[^]]*\]/g, "")

        // clean up
        .replace(/[ ]+/g, " ")
        .trim();

    return toLaxTitleCase(fixed);
}

export function isVideo(fileName: string) {
    const type = mime.getType(fileName);
    if (!type) return false;
    return type.startsWith("video");
}
