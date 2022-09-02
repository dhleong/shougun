import * as chai from "chai";

import chaiAsPromised from "chai-as-promised";
import { anyString, instance, mock, when } from "ts-mockito";

import VersionNegotiatorFactory, {
    DEFAULT_VERSION_FACTORIES,
} from "../../../src/rpc/methods/VersionNegotiatorFactory";
import { Shougun } from "../../../src/shougun";
import {
    Connection,
    createPublishedMethodsHandler,
    EventHandler,
} from "../../../src/rpc/msgpack";
import { MethodsConstructor } from "../../../src/rpc/methods/types";

chai.use(chaiAsPromised);
chai.should();

const TEST_VERSION = 42;
const TEST_SUCCESS = 9001;

describe("VersionNegotiatorFactory", () => {
    let shougunMock: Shougun;
    let connectionMock: Connection;
    let eventHandler: EventHandler;

    beforeEach(() => {
        shougunMock = mock(Shougun);
        connectionMock = mock();

        const testVersionHandler = {
            performTest() {
                return TEST_SUCCESS;
            },
        };

        const shougun = instance(shougunMock);
        const factory: VersionNegotiatorFactory = new VersionNegotiatorFactory(
            shougun,
            {},
            {
                ...DEFAULT_VERSION_FACTORIES,
                [TEST_VERSION]: function () {
                    return testVersionHandler;
                } as unknown as MethodsConstructor,
            },
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

    it("requires version negotiation to call versioned methods", async () => {
        await (async () =>
            eventHandler.onRequest(
                "performTest",
                [],
            ))().should.eventually.be.rejectedWith(/Not Implemented/);
    });

    it("supports version negotiation to call versioned methods", async () => {
        await eventHandler.onRequest("version", [TEST_VERSION]);
        await eventHandler
            .onRequest("performTest", [])
            .should.eventually.equal(TEST_SUCCESS);
    });
});
