// import { Component, Type } from "./component";
import { getUniqueComponentId } from "./component";
import type { Entity } from "./entity";
import type { QueryModifier, QueryModifierFactory } from "./query";
import { WithRelationship } from "./relationships";

declare module "./entity" {
    interface EntityAPI {
        addChild(child: Entity): void;
        removeChild(child: Entity): void;
        children(): Entity[];
        parent(): Entity | null;
    }
}

export let CHILD!: number;
export let PARENT!: number;

export const loadHierarchyMethods = (methodLoaders: any[]) =>
    methodLoaders.push(() => {
        CHILD = getUniqueComponentId();
        PARENT = getUniqueComponentId();

        //@ts-expect-error
        Number.prototype.addChild = function (
            this: Entity,
            child: Entity
        ): void {
            this.relate(CHILD, child);
            child.relate(PARENT, this);
        };

        //@ts-expect-error
        Number.prototype.children = function (this: Entity) {
            return this.getAllRelatedBy(CHILD);
        };
        console.log("Added");
    });

// Parent query modifier
export const Parent: QueryModifierFactory<
    [] | [entity: Entity] | [requirements: QueryModifier]
> = (arg?) => {
    if (typeof arg == "number") {
        return WithRelationship(PARENT, arg);
    }

    const fn: QueryModifier = WithRelationship(PARENT);

    // If there is not requirement for the parent just return this
    if (arg == undefined) {
        return fn;
    }

    // Add the narrower

    // We need to check if the modifier passed in is also narrowed, to support recursive things
    if (typeof arg.narrower !== "undefined") {
        fn.narrower = function (ent: Entity) {
            const parent = ent.getSingleRelatedBy(PARENT)!;
            if (!arg(parent.components())) return false;

            return arg.narrower!(parent);
        };
    } else {
        fn.narrower = function (ent: Entity) {
            return arg(ent.getSingleRelatedBy(PARENT)!.components());
        };
    }

    return fn;
};

// Child query modifier
export const Child: QueryModifierFactory<
    [] | [entity: Entity] | [requirements: QueryModifier]
> = (arg?) => {
    if (typeof arg == "number") {
        return WithRelationship(CHILD, arg);
    }

    const fn = WithRelationship(CHILD);

    if (typeof arg == "undefined") return fn;

    // Same as parent, we have to check if the modifier is narrowed to support recursive narrows
    if (typeof arg.narrower == "function") {
        fn.narrower = function (entity) {
            const children = entity.children();
            if (!children.some((child) => arg(child.components())))
                return false;

            return children.some((child) => arg.narrower!(child));
        };
    } else
        fn.narrower = function (entity) {
            return entity
                .getAllRelatedBy(CHILD)
                .some((ent) => arg(ent.components()));
        };

    return fn;
};
