/// <reference types="node" />

declare module "talisman/metrics/distance/jaro-winkler" {
    export interface IJaroWinklerParams {
        boostThreshold?: number;
        scalingFactor?: number;
    }
    export function custom(params: IJaroWinklerParams, a: string, b: string): number;
}

declare module "talisman/phonetics/double-metaphone" {
    export default function metaphone(s: string): string;
}
