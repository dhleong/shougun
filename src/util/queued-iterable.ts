const nop = () => {
    /* nop */
};

class Deferred<T> {
    public resolve: (v: T) => void = nop;
    public reject: (e?: Error) => void = nop;

    public readonly promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
}

class QueuedState<T> {
    public readonly queue: T[] = [];
    public valueAvailable = new Deferred<null>();
    public isClosed = false;

    constructor(public readonly cleanup?: () => void) {}
}

class Iterator<T> implements AsyncIterator<T> {
    constructor(private readonly state: QueuedState<T>) {}

    public async next(): Promise<IteratorResult<T>> {
        if (this.state.queue.length) {
            return {
                done: false,
                value: this.state.queue.pop() as T,
            };
        }

        await this.state.valueAvailable.promise;
        if (this.state.isClosed) {
            return { done: true, value: null };
        }

        return {
            done: false,
            value: this.state.queue.pop() as T,
        };
    }

    public async return(): Promise<IteratorResult<T>> {
        if (this.state.cleanup) {
            this.state.cleanup();
        }
        return { done: true, value: null };
    }

    public async throw(e: Error): Promise<IteratorResult<T>> {
        if (this.state.cleanup) {
            this.state.cleanup();
        }
        return Promise.reject(e);
    }
}

export class QueuedIterable<T> implements AsyncIterable<T> {
    private readonly state: QueuedState<T>;

    constructor(cleanup?: () => void) {
        this.state = new QueuedState<T>(cleanup);
    }

    public [Symbol.asyncIterator](): AsyncIterator<T> {
        return new Iterator(this.state);
    }

    public notify(value: T) {
        this.state.queue.push(value);
        this.state.valueAvailable.resolve(null);
        this.state.valueAvailable = new Deferred();
    }

    public close() {
        this.state.isClosed = true;
        this.state.valueAvailable.resolve(null);
        if (this.state.cleanup) {
            this.state.cleanup();
        }
    }
}
