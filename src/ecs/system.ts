import { isClass } from "../utils/class";
import { MatchingTree, Tree, TreeBranch } from "../utils/types";
import { intoID } from "./entity";
import { Query, QueryModifier, IntoQueryModifier, All, With } from "./query";
import type { World } from "./world";

export type SystemOrdering =
    | "STANDARD"
    | "FIRST"
    | "LAST"
    | {
          position: number;
      }
    | {
          before: intoID;
      }
    | {
          after: intoID;
      };

export class BagelSystem<T extends Tree<Query>> {
    /** @internal */
    public static nextSystemId: number = 0;
    public declare static id: number;

    public declare readonly entities: T;
    public static readonly runOrder: SystemOrdering = "STANDARD";

    constructor(public world: World) {}

    init() {}

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

    class CustomSystemClass extends BagelSystem<T> {
        public readonly entities = realQueries;
        public static id = BagelSystem.nextSystemId++;
    }

    return CustomSystemClass as typeof CustomSystemClass;
}

function isIntoQueryModifier(
    tree: Tree<IntoQueryModifier>
): tree is IntoQueryModifier {
    return tree.constructor !== Object;
}

function intoQueryModifierToQueryModifier(query: IntoQueryModifier): QueryModifier {
    if (typeof query == "number") {
        return With(query);
    }

    if (typeof query === "function" && !isClass(query)) {
        return query as QueryModifier;
    }

    if (Array.isArray(query)) {
        return All(
            ...(query.map(intoQueryModifierToQueryModifier) as QueryModifier[])
        );
    }

    return With(query.getId());
}

function queryModifierToQuery(tree: Tree<IntoQueryModifier>): Tree<Query> {
    if (isIntoQueryModifier(tree)) {
        return new Query(intoQueryModifierToQueryModifier(tree));
    }

    if (Array.isArray(tree)) {
        return tree.map(queryModifierToQuery);
    }

    let obj = {} as any;
    for (const [key, val] of Object.entries(tree)) {
        obj[key] = queryModifierToQuery(val);
    }
    return obj;
}
