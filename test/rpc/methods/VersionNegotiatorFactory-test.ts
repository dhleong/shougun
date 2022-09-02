import * as chai from "chai";

import { anyString, mock, when } from "ts-mockito";

import VersionNegotiatorFactory from "../../../src/rpc/methods/VersionNegotiatorFactory";
import { Shougun } from "../../../src/shougun";
import {
    Connection,
    createPublishedMethodsHandler,
    EventHandler,
} from "../../../src/rpc/msgpack";

chai.should();

describe("VersionNegotiatorFactory", () => {
    let shougun: Shougun;
    let connection: Connection;
    let eventHandler: EventHandler;

    beforeEach(() => {
        shougun = mock(Shougun);
        connection = mock();

        const factory: VersionNegotiatorFactory = new VersionNegotiatorFactory(
            shougun,
            {},
        );

        eventHandler = createPublishedMethodsHandler(factory.create)(
            connection,
        );
    });

    it("transparently supports default version", async () => {
        when(shougun.findMedia(anyString())).thenResolve(undefined);

        const promise = eventHandler.onRequest("startByTitle", [
            "The Good Place",
        ]);

        return promise.should.eventually.be.rejectedWith(/No result for/);
    });
});
