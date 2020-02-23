import * as chai from "chai";

import { fileNameToTitle, sortEpisodes, sortKey, titleToId } from "../../src/media/util";
import { IEpisode, MediaType } from "../../src/model";

chai.should();

describe("fileNameToTitle", () => {
    it("tries to strip codec and format info", () => {
        fileNameToTitle("Hana yori dango ep08 (704x396 DivX).avi")
            .should.equal("Hana Yori Dango Ep08");

        fileNameToTitle("nodame_cantabile_ep11(D-CX_704x396_DivX6).avi")
            .should.equal("Nodame Cantabile Ep11");

        fileNameToTitle("Movie [1080p]")
            .should.equal("Movie");

        fileNameToTitle("Movie.1920.BluRay.1080p.x265.10bit.4Audio.ABCD-EFG")
            .should.equal("Movie 1920");

        fileNameToTitle("[TV] Show 091 (H264,OGG)-.mkv")
            .should.equal("Show 091");

        fileNameToTitle("Show 091-TV.mkv")
            .should.equal("Show 091");

        fileNameToTitle("日本語-01.mp4")
            .should.equal("日本語-01");
    });

    it("Strips season contents", () => {
        fileNameToTitle("Series.S01-S02.Complete.x264.etc")
            .should.equal("Series");
    });
});

describe("sortKey", () => {
    it("splits up titles", () => {
        sortKey("Firefly 01").should.deep.equal([
            1,
        ]);
        sortKey("Firefly 10").should.deep.equal([
            10,
        ]);

        sortKey("Firefly s01e02").should.deep.equal([
            1,
            2,
        ]);
    });
});

describe("sortEpisodes", () => {
    it("uses natural ordering", () => {
        sortEpisodes([
            namedEpisode("Firefly 1"),
            namedEpisode("Firefly 10"),
            namedEpisode("Firefly 2"),
        ]).map(it => it.title).should.deep.equal([
            "Firefly 1",
            "Firefly 2",
            "Firefly 10",
        ]);
    });

    it("handles title-first naming", () => {
        sortEpisodes([
            namedEpisode("The Train Job 2"),
            namedEpisode("Our Mrs. Reynolds 6"),
            namedEpisode("Shindig 4"),
            namedEpisode("Serenity 1"),
        ]).map(it => it.title).should.deep.equal([
            "Serenity 1",
            "The Train Job 2",
            "Shindig 4",
            "Our Mrs. Reynolds 6",
        ]);
    });
});

function namedEpisode(title: string): IEpisode {
    return {
        discovery: "test",
        id: titleToId(title),
        seriesId: "series",
        title,
        type: MediaType.Episode,
    };
}
