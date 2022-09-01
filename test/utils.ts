import { IEpisode, MediaType } from "../src/model";

export function fakeEpisode(id: string, seriesId = "series"): IEpisode {
    return {
        discovery: "fake",
        id,
        seriesId,
        title: `Fake: ${id}`,
        type: MediaType.Episode,
    };
}
