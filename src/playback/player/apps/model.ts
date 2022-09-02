export interface ICloseableApp {
    close(): void;
}

export function isCloseable(app: unknown): app is ICloseableApp {
    return typeof (app as any).close === "function";
}
