import type { Shougun } from "../../shougun";
import { Connection } from "../msgpack";
import type { IRemoteConfig } from "../server";

export type MethodsConstructor<T = unknown> = new (
    connection: Connection,
    shougun: Shougun,
    config: IRemoteConfig,
) => T;

export function composeMethods(
    BaseType: MethodsConstructor,
    ReplacementsType: MethodsConstructor,
    // eslint-disable-next-line @typescript-eslint/ban-types
): MethodsConstructor<object> {
    function ComposedMethods(
        connection: Connection,
        shougun: Shougun,
        config: IRemoteConfig,
    ) {
        const base = new BaseType(connection, shougun, config);
        const replacements = new ReplacementsType(connection, shougun, config);
        return new Proxy(replacements as any, {
            get(target, prop) {
                if (prop in target) {
                    return (target as any)[prop];
                }

                return (base as any)[prop];
            },
        });
    }

    // Trust me:
    // eslint-disable-next-line @typescript-eslint/ban-types
    return ComposedMethods as unknown as MethodsConstructor<object>;
}
