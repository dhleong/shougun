import _debug from "debug";
import EventEmitter from "events";
import msgpack from "msgpack-lite";
import type { Socket } from "net";

const debug = _debug("shougun:rpc:msgpack");

export interface Connection {
    notify(method: string, ...params: unknown[]): Promise<void>;
    request<R>(method: string, ...params: unknown[]): Promise<R>;

    once(event: "close", onClose: () => void): void;
}

export interface EventHandler {
    onRequest(method: string, params: unknown[]): Promise<unknown>;
    onNotify(method: string, params: unknown[]): void;
}

type EventHandlerFactory = (connection: Connection) => EventHandler;

type RequestMessage = [type: 0, id: number, method: string, params: unknown[]];
type ResponseMessage = [
    type: 1,
    id: number,
    error: string | null,
    result: unknown,
];
type NotifyMessage = [type: 2, method: string, params: unknown[]];
type Message = RequestMessage | ResponseMessage | NotifyMessage;

// Message IDs are 32-bit unsigned integers
const MAX_MESSAGE_ID = 2 ** 32 - 1;

class SocketConnection extends EventEmitter implements Connection {
    private lastMessageId = 0;

    public responseHandlers: {
        [id: number]: (error: string | null, response: unknown) => void;
    } = {};

    constructor(
        private readonly socket: Socket,
        private readonly msgpackOptions: msgpack.EncoderOptions,
    ) {
        super();
    }

    public async notify(method: string, ...params: unknown[]): Promise<void> {
        await this.write([2, method, params]);
    }

    public async request<R>(method: string, ...params: unknown[]): Promise<R> {
        const id =
            this.lastMessageId < MAX_MESSAGE_ID ? this.lastMessageId + 1 : 0;
        this.lastMessageId = id;

        await this.write([0, id, method, params]);
        return new Promise<R>((resolve, reject) => {
            this.responseHandlers[id] = (error, response) => {
                delete this.responseHandlers[id];

                if (error != null) {
                    reject(new Error(error));
                } else {
                    resolve(response as R);
                }
            };
        });
    }

    public async respond(
        msgId: number,
        error: string | null,
        response?: unknown,
    ): Promise<void> {
        await this.write([1, msgId, error, response]);
    }

    private write(message: Message) {
        return new Promise((resolve) => {
            this.socket.write(
                msgpack.encode(message, this.msgpackOptions),
                resolve,
            );
        });
    }
}

export function createConnectionHandler(handlerFactory: EventHandlerFactory) {
    const encoder = msgpack.createCodec();
    const decoder = msgpack.createCodec();
    return (socket: Socket) => {
        const connection = new SocketConnection(socket, { codec: encoder });
        const handler = handlerFactory(connection);
        socket
            .pipe(msgpack.createDecodeStream({ codec: decoder }))
            .on("close", () => connection.emit("close"))
            .on("data", (message: Message) => {
                switch (message[0]) {
                    case 0:
                        // NOTE: We wrap the onRequest handler *just in case*
                        // it throws something before returning a Promise, to ensure
                        // our .catch handles all errors
                        (async () => {
                            return handler.onRequest(message[2], message[3]);
                        })()
                            .then((response) =>
                                connection.respond(message[1], null, response),
                            )
                            .catch((e) => {
                                debug(
                                    `Encountered error handling request to ${message[2]}`,
                                    e,
                                );
                                return connection.respond(message[1], `${e}`);
                            });
                        break;

                    case 1: {
                        const [, msgId, error, response] = message;
                        connection.responseHandlers[msgId]?.(error, response);
                        break;
                    }

                    case 2:
                        (async () => {
                            return handler.onNotify(message[1], message[2]);
                        })().catch((e) =>
                            debug(`Error handling notify ${message[1]}`, e),
                        );
                        break;
                }
            });
    };
}

// eslint-disable-next-line @typescript-eslint/ban-types
type PublishedMethodsReceiverFactory = (connection: Connection) => object;

export function createPublishedMethodsHandler(
    receiverFactory: PublishedMethodsReceiverFactory,
): EventHandlerFactory {
    return (connection: Connection) => {
        const receiver = receiverFactory(connection);

        const invoke = (method: string, params: unknown[]) =>
            (async () => {
                if (method.startsWith("_")) {
                    throw new Error(`Invalid method name: ${method}`);
                }
                debug("invoke", method);
                return (receiver as any)[method](...params);
            })();

        return {
            onNotify(method: string, params: unknown[]) {
                if (typeof (receiver as any)[method] === "function") {
                    return invoke(method, params).catch((e) => {
                        debug(`Error handling ${method}`, e);
                    });
                }
            },

            onRequest(method, params: unknown[]) {
                if (typeof (receiver as any)[method] === "function") {
                    return invoke(method, params);
                }

                throw new Error(`Not Implemented: ${method}`);
            },
        };
    };
}

export function createPublishedMethodsConnectionHandler(
    receiverFactory: PublishedMethodsReceiverFactory,
) {
    return createConnectionHandler(
        createPublishedMethodsHandler(receiverFactory),
    );
}
