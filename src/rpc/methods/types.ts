import type { Shougun } from "../../shougun";
import { Connection } from "../msgpack";
import type { IRemoteConfig } from "../server";

export type MethodsConstructor<T = unknown> = new (
    connection: Connection,
    shougun: Shougun,
    config: IRemoteConfig,
) => T;

/**
 * When composing methods, if any method name in B collides with a method in A,
 * the signature in B is the one that will be used
 */
export type ComposedMethods<A, B> = { [K in keyof Omit<A, keyof B>]: A[K] } & B;

export function composeMethods<A, B>(
    BaseType: MethodsConstructor<A>,
    ReplacementsType: MethodsConstructor<B>,
): MethodsConstructor<ComposedMethods<A, B>> {
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
    return ComposedMethods as unknown as any;
}
