import { isClass } from "../utils/class";
import { Archetype } from "./archetype";
import { Entity, intoID } from "./entity";
import type { World } from "./world";

export type EntityNarrower = (ent: Entity) => boolean;
export interface QueryModifier {
    (components: ReadonlySet<number>): boolean;
    narrower?: EntityNarrower;
}

export type QueryModifierFactory<T extends any[] = any[]> = (
    ...args: T
) => QueryModifier;
export type IntoQueryModifier = intoID | intoID[] | QueryModifier;

export class Query {
    protected targetedArchetypes: Archetype[] = [];

    // Used for skipping entities when multithreading
    protected offset: number = 0;
    protected stepSize: number = 1;

    private lastCheckedArchetypes = new Map<Archetype, number>();

    setStepSizeAndOffset(stepSize: number, offset: number) {
        this.stepSize = stepSize;
        this.offset = offset;
    }

    private entityNarrower: EntityNarrower;

    constructor(public componentTester: QueryModifier) {
        if (typeof componentTester.narrower === "function") {
            this[Symbol.iterator] = this.iterator_narrower;
            this.forEach = this.forEach_narrower;
        }

        this.entityNarrower = componentTester.narrower!;
    }

    ignoreMultithreadingFragmentation() {
        this.offset = 0;
        this.stepSize = 1;
    }

    addTargetedArchetype(archetype: Archetype) {
        if (this.targetedArchetypes.includes(archetype)) return;

        this.targetedArchetypes.push(archetype);
        this.lastCheckedArchetypes.set(archetype, -Infinity);
    }

    // Default (no narrower)
    *[Symbol.iterator](): IterableIterator<Entity> {
        for (let i = this.targetedArchetypes.length - 1; i >= 0; i--) {
            for (
                let j = this.targetedArchetypes[i].entities[0] - this.offset;
                j > 0;
                j -= this.stepSize
            ) {
                yield this.targetedArchetypes[i].entities[j] as Entity;
            }
        }
    }

    forEach(fn: (entity: Entity) => void) {
        for (let i = this.targetedArchetypes.length - 1; i >= 0; i--) {
            for (
                let j = this.targetedArchetypes[i].entities[0] - this.offset;
                j > 0;
                j -= this.stepSize
            ) {
                fn(this.targetedArchetypes[i].entities[j] as Entity);
            }
        }
    }

    // With narrower
    private forEach_narrower(fn: (entity: Entity) => void) {
        for (let i = this.targetedArchetypes.length - 1; i >= 0; i--) {
            for (
                let j = this.targetedArchetypes[i].entities[0] - this.offset;
                j > 0;
                j -= this.stepSize
            ) {
                const ent = this.targetedArchetypes[i].entities[j] as Entity;
                if (this.entityNarrower(ent)) fn(ent);
            }
        }
    }

    private *iterator_narrower() {
        for (let i = this.targetedArchetypes.length - 1; i >= 0; i--) {
            for (
                let j = this.targetedArchetypes[i].entities[0] - this.offset;
                j > 0;
                j -= this.stepSize
            ) {
                const ent = this.targetedArchetypes[i].entities[j] as Entity;
                if (this.entityNarrower(ent)) yield ent;
            }
        }
    }

    // With state (added + removed)
    private addedState = new Set<Entity>();
    private removedState = new Set<Entity>();

    // Don't capture stack
    private readonly NO_OP = new Function() as (...args: any[]) => void;

    private forEach_state(
        state: Set<Entity>,
        addedFn: (entity: Entity) => void,
        removedFn: (entity: Entity) => void
    ) {
        const lastFrame = new Set(state);

        for (let i = this.targetedArchetypes.length - 1; i >= 0; i--) {
            const archetype = this.targetedArchetypes[i];

            // If nothing has changed in this archetype, just remove all the stuff
            if (
                archetype.lastModified === this.lastCheckedArchetypes.get(archetype)!
            ) {
                for (
                    let j = this.targetedArchetypes[i].entities[0] - this.offset;
                    j > 0;
                    j -= this.stepSize
                ) {
                    lastFrame.delete(
                        this.targetedArchetypes[i].entities[j] as Entity
                    );
                }
            } else {
                for (
                    let j = this.targetedArchetypes[i].entities[0] - this.offset;
                    j > 0;
                    j -= this.stepSize
                ) {
                    const ent = this.targetedArchetypes[i].entities[j] as Entity;
                    if (!state.has(ent)) {
                        state.add(ent);
                        addedFn(ent);
                    }

                    lastFrame.delete(ent);
                }
            }
        }

        lastFrame.forEach((ent) => {
            removedFn(ent);
            state.delete(ent);
        });
    }

    forEachAdded(fn: (ent: Entity) => void) {
        this.forEach_state(this.addedState, fn, this.NO_OP);
    }

    forEachRemoved(fn: (ent: Entity) => void) {
        this.forEach_state(this.removedState, this.NO_OP, fn);
    }
}

export class QueryManager {
    private queries: Query[] = [];

    constructor(public world: World) {}

    // Used for one time queries
    query(...modifiers: QueryModifier[]): Query {
        const query = new Query(All(...modifiers));

        for (const [id, archetype] of this.world.archetypeManager.archetypes) {
            if (query.componentTester(archetype.components)) {
                query.addTargetedArchetype(archetype);
            }
        }

        return query;
    }

    addQuery(query: Query) {
        this.queries.push(query);

        for (const [id, archetype] of this.world.archetypeManager.archetypes) {
            if (query.componentTester(archetype.components)) {
                query.addTargetedArchetype(archetype);
            }
        }
    }

    onNewArchetypeCreated(archetype: Archetype) {
        for (let i = 0; i < this.queries.length; i++) {
            if (this.queries[i].componentTester(archetype.components)) {
                this.queries[i].addTargetedArchetype(archetype);
            }
        }
    }
}

// Common Query Modifiers
export const With: QueryModifierFactory<
    [...components: intoID[]] | [modifier: QueryModifier]
> = (...components) => {
    if (
        components.length === 1 &&
        typeof components[0] === "function" &&
        !isClass(components[0])
    )
        return components[0] as QueryModifier;

    components = components.map((c) => (typeof c == "number" ? c : c.getId()));

    return (test: ReadonlySet<number>) =>
        components.every((c) => test.has(c as number));
};

export const Without: QueryModifierFactory<intoID[]> = (...components) => {
    components = components.map((c) => (typeof c == "number" ? c : c.getId()));

    return (test: ReadonlySet<number>) =>
        components.every((c) => !test.has(c as number));
};

export const Not: QueryModifierFactory<[arg: QueryModifier]> =
    (modifier: QueryModifier) => (components) =>
        !modifier(components);

export const All: QueryModifierFactory<QueryModifier[]> = (...modifiers) => {
    const fn: QueryModifier = function AllModifier(components) {
        for (let i = modifiers.length - 1; i > -1; i--) {
            if (!modifiers[i](components)) return false;
        }

        return true;
    };

    const narrowers = modifiers
        .map((modifier) => modifier.narrower)
        .filter((f): f is EntityNarrower => typeof f == "function");

    if (narrowers.length > 0) {
        fn.narrower = function (ent) {
            for (let i = narrowers.length - 1; i > -1; i--) {
                if (!narrowers[i](ent)) return false;
            }

            return true;
        };
    }

    return fn;
};
