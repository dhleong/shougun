import mime from "mime";
import os from "os";
import path from "path";
import slug from "speakingurl";
import { IEpisode, ISeason } from "../model";

// NOTE: This is a bit hacky because titlecase doesn't have typings...
// eslint-disable-next-line @typescript-eslint/no-var-requires
const titlecase = require("titlecase");

// eslint-disable-next-line prefer-destructuring
const toLaxTitleCase: (s: string) => string = titlecase.toLaxTitleCase;

export function nestId(parentId: string, childId: string) {
    return `${parentId}:${childId}`;
}

export const titleToId = slug;

export function fileType(fileName: string) {
    const type = mime.getType(fileName);
    if (!type) return "other";
    if (type.startsWith("image")) {
        return "image";
    }
    if (type.startsWith("video")) {
        return "video";
    }
    return "other";
}

export function isImage(fileName: string) {
    return fileType(fileName) === "image";
}

export function isVideo(fileName: string) {
    return fileType(fileName) === "video";
}

export function fileNameToTitle(fileName: string) {
    let name = fileName;
    if (isVideo(name)) {
        // strip extension
        name = name.substring(0, name.lastIndexOf("."));
    }

    const fixed = name
        .replace(/[_.]/g, " ")

        // strip format/codec info
        // tslint:disable-next-line max-line-length
        .replace(
            /((720|1080)p|[0-9]{3,4}x[0-9]{3,4}|(x|h)[ ]?264|ogg|aac|mpeg|divx[0-9]*|hevc|[0-9]+bit|xvid(hd)?)(.(?!\b[sep]+\d))*/gi,
            "",
        )
        .replace(/\b(web|hdtv|tv|br|bd|bluray)\b[-]?(rip|dl)?/gi, "")

        // this strips parenthesis with irrelevent stuff inside
        .replace(/\(([a-z]{0,3}|[, -]+){0,4}(\)|$)/gi, "")

        // brackets are rarely parts of titles
        .replace(/\[.*?\]/g, "")

        // trailing garbage
        .replace(/[([{]$/, "")
        .replace(/-[A-Z][A-Z0-9]*$/, "")
        .replace(/[^a-zA-Z0-9()]+$/, "")

        // clean up
        .replace(/[ ]+/g, " ")

        // season ranges and everything after can go at this point
        .replace(/(S\d+(-S\d+)?( .*))$/, "")
        .trim();

    return toLaxTitleCase(fixed);
}

export function resolvePath(original: string) {
    return path.resolve(original.replace("~", os.homedir()));
}

export function sortKey(title: string) {
    const regex = /(\d+)/g;
    const key = [];

    for (;;) {
        const matches = regex.exec(title);
        if (!matches) break;

        key.push(parseInt(matches[1], 10));
    }

    return key;
}

export function compareSortKeys(a: number[], b: number[]) {
    const end = Math.min(a.length, b.length);
    for (let i = 0; i < end; ++i) {
        const fromA = a[i];
        const fromB = b[i];
        const delta = fromA - fromB;
        if (delta !== 0) {
            return delta;
        }
    }

    return 0;
}

export function sortEpisodes(episodes: IEpisode[]) {
    return episodes.sort((a, b) => {
        const aKey = sortKey(a.title);
        const bKey = sortKey(b.title);
        return compareSortKeys(aKey, bKey);
    });
}

export function sortSeasons(seasons: ISeason[]) {
    return seasons.sort((a, b) => {
        const aKey = sortKey(a.title || "");
        const bKey = sortKey(b.title || "");
        return compareSortKeys(aKey, bKey);
    });
}

export function fileNameToId(name: string) {
    return titleToId(fileNameToTitle(name));
}
