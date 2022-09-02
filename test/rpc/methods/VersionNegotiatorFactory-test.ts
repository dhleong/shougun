import * as chai from "chai";

import chaiAsPromised from "chai-as-promised";
import { anyString, instance, mock, when } from "ts-mockito";

import VersionNegotiatorFactory from "../../../src/rpc/methods/VersionNegotiatorFactory";
import { Shougun } from "../../../src/shougun";
import {
    Connection,
    createPublishedMethodsHandler,
    EventHandler,
} from "../../../src/rpc/msgpack";

chai.use(chaiAsPromised);
chai.should();

describe("VersionNegotiatorFactory", () => {
    let shougunMock: Shougun;
    let connectionMock: Connection;
    let eventHandler: EventHandler;

    beforeEach(() => {
        shougunMock = mock(Shougun);
        connectionMock = mock();

        const shougun = instance(shougunMock);
        const factory: VersionNegotiatorFactory = new VersionNegotiatorFactory(
            shougun,
            {},
        );

        eventHandler = createPublishedMethodsHandler((c) => factory.create(c))(
            instance(connectionMock),
        );
    });

    it("transparently supports default version", async () => {
        when(shougunMock.findMedia(anyString())).thenResolve(undefined);

        const promise = eventHandler.onRequest("startByTitle", [
            "The Good Place",
        ]);

        return promise.should.eventually.be.rejectedWith(/No result for/);
    });
});
