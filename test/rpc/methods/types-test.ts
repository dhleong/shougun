import * as chai from "chai";

import { instance, mock } from "ts-mockito";
import chaiAsPromised from "chai-as-promised";

import {
    Connection,
    createPublishedMethodsHandler,
    EventHandler,
} from "../../../src/rpc/msgpack";
import { Shougun } from "../../../src/shougun";
import { composeMethods } from "../../../src/rpc/methods/types";
import { RpcMethodsV1 } from "../../../src/rpc/methods/v1";

chai.use(chaiAsPromised);
chai.should();

const TEST_RESULT = 42;

class TestMethods {
    public performTest() {
        return TEST_RESULT;
    }

    public start() {
        throw new Error("Overriden");
    }
}

describe("composeMethods", () => {
    let shougunMock: Shougun;
    let connectionMock: Connection;
    let eventHandler: EventHandler;

    beforeEach(() => {
        shougunMock = mock(Shougun);
        const shougun = instance(shougunMock);

        connectionMock = mock();

        const Type = composeMethods(RpcMethodsV1, TestMethods);
        eventHandler = createPublishedMethodsHandler(
            (c) => new Type(c, shougun, {}),
        )(instance(connectionMock));
    });

    it("creates an instantiable type with all methods", () => {
        const Type = composeMethods(RpcMethodsV1, TestMethods);
        const methods = new Type(
            instance(connectionMock),
            instance(shougunMock),
            {},
        );

        (methods as any).startByTitle.should.be.a("function");
        (methods as any).performTest.should.be.a("function");
    });

    it("works with createPublishedMethodsHandler", async () => {
        await eventHandler
            .onRequest("startByTitle", ["The Good Place"])
            .should.eventually.be.rejectedWith(/No result/);

        await eventHandler
            .onRequest("performTest", [])
            .should.eventually.equal(TEST_RESULT);
    });

    it("supports replacing method signatures", async () => {
        await eventHandler
            .onRequest("start", [])
            .should.eventually.be.rejectedWith(/Overriden/);
    });
});
