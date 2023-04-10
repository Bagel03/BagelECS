import { Archetype } from "./archetype";
import { Entity, intoID } from "./entity";
import { World } from "./world";

export const QUERY_TAG = Symbol("Query");

export type QueryModifier = (components: Set<number>) => boolean;
export type IntoQueryModifier = intoID | intoID[] | QueryModifier;

export class Query {
    private targetedArchetypes: Archetype[] = [];
    public readonly [QUERY_TAG] = true as const;

    constructor(public componentTester: QueryModifier) {}

    addTargetedArchetype(archetype: Archetype) {
        this.targetedArchetypes.push(archetype);
    }

    *[Symbol.iterator](): IterableIterator<Entity> {
        // for (let i = 0; i < this.targetedArchetypes.length; i++) {
        //     for (
        //         let j = 1;
        //         j < this.targetedArchetypes[i].entities[0] + 1;
        //         j++
        //     ) {
        //         yield this.targetedArchetypes[i].entities[j] as Entity;
        //     }
        // }
        for (let i = this.targetedArchetypes.length - 1; i >= 0; i--) {
            for (let j = this.targetedArchetypes[i].entities[0]; j > 0; j--) {
                yield this.targetedArchetypes[i].entities[j] as Entity;
            }
        }
    }

    forEach(fn: (entity: Entity) => void) {
        for (let i = this.targetedArchetypes.length - 1; i >= 0; i--) {
            for (let j = this.targetedArchetypes[i].entities[0]; j > 0; j--) {
                fn(this.targetedArchetypes[i].entities[j] as Entity);
            }
        }
    }
}

export class QueryManager {
    private queries: Query[] = [];

    constructor(private world: World) {}

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

    /** @internal */
    onNewArchetypeCreated(archetype: Archetype) {
        for (let i = 0; i < this.queries.length; i++) {
            if (this.queries[i].componentTester(archetype.components)) {
                this.queries[i].addTargetedArchetype(archetype);
            }
        }
    }
}

// Common Query Modifiers
export const With =
    (...components: number[]) =>
    (test: Set<number>) =>
        components.every((c) => test.has(c));

export const Without =
    (...components: number[]) =>
    (test: Set<number>) =>
        components.every((c) => !test.has(c));

export const All =
    (...modifiers: QueryModifier[]) =>
    (components: Set<number>) =>
        modifiers.every((m) => m(components));
