import _debug from "debug";
import EventEmitter from "events";
import msgpack from "msgpack-lite";
import type { Socket } from "net";

const debug = _debug("shougun:msgpack");

export interface Connection {
    notify(method: string, ...params: unknown[]): Promise<void>;
    request<R>(method: string, ...params: unknown[]): Promise<R>;
}

export interface EventHandler {
    onRequest(method: string, params: unknown[]): Promise<unknown>;
    onNotify(method: string, params: unknown[]): void;
}

type RequestMessage = [type: 0, id: number, method: string, params: unknown[]];
type ResponseMessage = [
    type: 1,
    id: number,
    error: string | null,
    result: unknown,
];
type NotifyMessage = [type: 2, method: string, params: unknown[]];
type Message = RequestMessage | ResponseMessage | NotifyMessage;

class SocketConnection extends EventEmitter implements Connection {
    private nextMessageId = 0;

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
        const id = this.nextMessageId++;
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

export function createConnectionHandler(
    handlerFactory: (connection: Connection) => EventHandler,
) {
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
                        handler
                            .onRequest(message[2], message[3])
                            .then((response) =>
                                connection.respond(message[1], null, response),
                            )
                            .catch((e) => {
                                return connection.respond(message[1], `${e}`);
                            });
                        break;

                    case 1: {
                        const [, msgId, error, response] = message;
                        connection.responseHandlers[msgId]?.(error, response);
                        break;
                    }

                    case 2:
                        handler.onNotify(message[1], message[2]);
                        break;
                }
            });
    };
}

export function createPublishedMethodsHandler(
    receiverFactory: (connection: Connection) => Record<string, unknown>,
) {
    return createConnectionHandler((connection) => {
        const receiver = receiverFactory(connection);

        const invoke = (method: string, params: unknown[]) =>
            (async () => (receiver as any)[method](...params))();

        return {
            onNotify(method: string, params: unknown[]) {
                if (typeof receiver[method] === "function") {
                    invoke(method, params).catch((e) => {
                        debug(`Error handling ${method}`, e);
                    });
                }
            },

            onRequest(method, params: unknown[]) {
                if (typeof receiver[method] === "function") {
                    return invoke(method, params);
                }

                throw new Error(`Not Implemented: ${method}`);
            },
        };
    });
}
