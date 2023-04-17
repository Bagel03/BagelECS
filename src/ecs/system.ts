import { isClass } from "../utils/class";
import { MatchingTree, Tree } from "../utils/types";
import { Query, QueryModifier, IntoQueryModifier, All, With } from "./query";
import type { World } from "./world";

export class InternalSystem<T extends Tree<Query>> {
    /** @internal */
    public static nextSystemId: number = 0;
    public static id = this.nextSystemId++;

    public declare readonly entities: T;

    constructor(public world: World) {}

    /** @internal */
    setStepSizeAndOffset(
        stepSize: number,
        offset: number,
        obj: Tree<Query> = this.entities
    ) {
        if (obj instanceof Query) {
            obj.setStepSizeAndOffset(stepSize, offset);
        } else {
            for (const val of Object.values(obj)) {
                this.setStepSizeAndOffset(stepSize, offset, val);
            }
        }
    }

    update() {}
}

export function System<
    Into extends Tree<IntoQueryModifier>,
    T extends MatchingTree<Into, IntoQueryModifier, Query>
>(queries: Into) {
    // Convert it from query modifier things to normal queries;
    const realQueries = queryModifierToQuery(queries) as T;

    class CustomSystemClass extends InternalSystem<T> {
        public readonly entities = realQueries;
    }

    return CustomSystemClass as typeof CustomSystemClass & {
        new (world: World): InternalSystem<T>;
    };

    function intoQueryModifierToQueryModifier(
        query: IntoQueryModifier
    ): QueryModifier | false {
        if (query.constructor === Object) return false;

        if (typeof query == "number") {
            return With(query);
        }

        if (typeof query === "function" && !isClass(query)) {
            return query as QueryModifier;
        }

        // if (
        //     Array.isArray(query) &&
        //     query
        //         .flatMap(intoQueryModifierToQueryModifier)
        //         .every((t) => typeof t == "number")
        // ) {
        //     return With(...query.flatMap(intoQueryModifierToQueryModifier) as number[]);
        // }

        if (Array.isArray(query)) {
            return All(
                ...(query.map(
                    intoQueryModifierToQueryModifier
                ) as QueryModifier[])
            );
        }

        return With(query.getId());
    }

    function queryModifierToQuery(tree: Tree<IntoQueryModifier>): Tree<Query> {
        const modifier = intoQueryModifierToQueryModifier(tree);
        if (modifier) {
            return new Query(modifier);
        }

        let obj = {} as any;
        for (const [key, val] of Object.entries(tree)) {
            obj[key] = queryModifierToQuery(val);
        }
        return obj;
    }
}
