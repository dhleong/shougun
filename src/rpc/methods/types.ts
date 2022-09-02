import type { Shougun } from "../../shougun";
import { Connection } from "../msgpack";
import type { IRemoteConfig } from "../server";

export type MethodsConstructor<T = unknown> = new (
    connection: Connection,
    shougun: Shougun,
    config: IRemoteConfig,
) => T;

export function composeMethods(
    baseType: MethodsConstructor,
    replacementsType: MethodsConstructor,
): MethodsConstructor<object> {
    // @ts-expect-error
    return function (
        connection: Connection,
        shougun: Shougun,
        config: IRemoteConfig,
    ) {
        const base = new baseType(connection, shougun, config);
        const replacements = new replacementsType(connection, shougun, config);
        return new Proxy(replacements as any, {
            get(target, prop) {
                if (prop in target) {
                    return (target as any)[prop];
                }

                return (base as any)[prop];
            },
        });
    };
}
