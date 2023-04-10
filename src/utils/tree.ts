import type { Tree } from "./types";

/** @internal */
export function flattenTree<C extends any, T extends Tree<C>, R = C>(
    tree: T,
    into: R[],
    mapFn: (arg: C) => R = (x) => x as any
): void {
    if (typeof tree == "object") {
        for (const val of Object.values<Tree<C>>(tree as any)) {
            flattenTree(val, into);
        }
    }

    into.push(mapFn(tree as C));
}
