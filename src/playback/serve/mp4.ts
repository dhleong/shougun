import fastify from "fastify";
import fs from "fs-extra";
import rangeParser from "range-parser";

export async function serveMp4(
    req: fastify.FastifyRequest<any>,
    reply: fastify.FastifyReply<any>,
    localPath: string,
) {

    const stat = await fs.stat(localPath);
    const length = stat.size;

    // common headers
    reply.header("Content-Type", "video/mp4");

    const { range } = req.headers;
    if (range) {
        // range request
        const requestedRanges = rangeParser(length, range);
        if (typeof requestedRanges === "number") {
            throw new Error("Invalid range");
        }

        const r = requestedRanges[0];
        reply.header("Content-Range", `bytes ${r.start}-${r.end}/${length}`);
        reply.header("Accept-Ranges", "bytes");
        reply.header("Content-Length", r.end - r.start + 1);
        reply.status(206);

        return fs.createReadStream(localPath, r);
    }

    reply.header("Content-Length", length);
    return fs.createReadStream(localPath);
}
