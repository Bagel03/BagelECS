import { isClass } from "../utils/class.js";
import { MatchingTree, Tree } from "../utils/types.js";
import { intoID } from "./entity.js";
import {
    Query,
    QueryModifier,
    QUERY_TAG,
    IntoQueryModifier,
    All,
    With,
} from "./query.js";
import { World } from "./world.js";

export class System<T extends Tree<Query>> {
    /** @internal */
    public static nextSystemId: number = 0;
    public static id = this.nextSystemId++;

    public declare readonly entities: T;

    constructor(public world: World) {}

    update() {}
}

export function CustomSystem<
    Into extends Tree<IntoQueryModifier>,
    T extends MatchingTree<Into, IntoQueryModifier, Query>
>(queries: Into) {
    // Convert it from query modifier things to normal queries;
    const realQueries = queryModifierToQuery(queries) as T;

    class CustomSystemClass extends System<T> {
        public readonly entities = realQueries;
    }

    return CustomSystemClass as typeof CustomSystemClass & {
        new (world: World): System<T>;
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
