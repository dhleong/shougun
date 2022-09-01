import * as chai from "chai";
import chaiSubset from "chai-subset";
import { anything, capture, instance, mock, when } from "ts-mockito";

import { ChromecastDevice } from "babbling";

import { Context } from "../../../src/context";
import { DefaultMediaReceiverApp } from "../../../src/playback/player/apps/default";
import { ChromecastPlayer } from "../../../src/playback/player/chromecast";
import { ServedPlayable } from "../../../src/playback/serve";
import { fakeEpisode } from "../../utils";

chai.use(chaiSubset);
chai.should();

describe("ChromecastPlayer", () => {
    let appMock: DefaultMediaReceiverApp;
    let app: DefaultMediaReceiverApp;

    let deviceMock: ChromecastDevice;
    let device: ChromecastDevice;

    let contextMock: Context;
    let context: Context;

    let player: ChromecastPlayer;

    beforeEach(() => {
        appMock = mock(DefaultMediaReceiverApp);
        app = instance(appMock);

        deviceMock = mock(ChromecastDevice);
        device = instance(deviceMock);
        when(deviceMock.openApp(DefaultMediaReceiverApp)).thenResolve(app);

        contextMock = mock(Context);
        context = instance(contextMock);

        player = new ChromecastPlayer(device);
    });

    it("loads a queue for episodes", async () => {
        const playableMedia = fakeEpisode("index-1");

        const playableMock = mock(ServedPlayable);
        when(playableMock.id).thenReturn(playableMedia.id);
        when(playableMock.media).thenReturn(playableMedia);
        when(playableMock.loadQueueAround(context)).thenResolve([
            fakeEpisode("index-0"),
            playableMedia,
            fakeEpisode("index-2"),
        ]);

        when(playableMock.getUrl(context, anything())).thenResolve("URL");

        const playable = instance(playableMock);

        await player.play(context, playable);

        const [params] = capture(appMock.load).last();
        params.should.containSubset({
            queueAround: [
                { url: "URL?queueIndex=0" },
                { url: "URL" },
                { url: "URL?queueIndex=2" },
            ],
        });
    });
});
