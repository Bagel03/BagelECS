import { Entity } from "./entity";
import { World } from "./world";
import { Logger } from "../utils/logger";

const logger = new Logger("Archetype Manager");
export class Archetype {
    public readonly graph = {
        added: new Map<number, Archetype>(),
        removed: new Map<number, Archetype>(),
    };

    // Use the [length, ...data] syntax to sync archetypes between threads
    public readonly entities: Int32Array;

    // Keep track of modifications so we dont have to diff the whole archetype every time
    // I would like to use something other than time for this, but theres a whole host of bugs that
    // come with using a combination of the last function (add, remove) and the entity.
    public lastModified: number;

    constructor(
        public readonly id: number,
        public readonly components: Set<number>,
        expectedSize: number
    ) {
        this.entities = new Int32Array(
            new SharedArrayBuffer(
                Int32Array.BYTES_PER_ELEMENT * (expectedSize + 1)
            )
        );

        this.lastModified = performance.now();
    }

    addEntity(entity: Entity) {
        // TODO: Check if max length is reached
        this.entities[++this.entities[0]] = entity;

        this.lastModified = performance.now();
    }

    removeEntity(entity: Entity) {
        for (let i = 1; i <= this.entities[0]; i++) {
            if (this.entities[i] === entity) {
                // Swap the entity and the last one
                this.entities[i] = this.entities[this.entities[0]--];
                break;
            }
        }

        this.lastModified = performance.now();
    }

    /** @internal */
    resize(size: number) {
        const newArr = new Int32Array(
            new SharedArrayBuffer((size + 1) * Int32Array.BYTES_PER_ELEMENT)
        );
        newArr.set(this.entities);

        //@ts-expect-error
        this.entities = newArr;
    }
}

export class ArchetypeManager {
    public readonly archetypes: Map<number, Archetype> = new Map();
    public readonly entityArchetypes: Int32Array;
    private nextArchetypeId = 1;

    public readonly defaultArchetype: Archetype = new Archetype(
        0,
        new Set(),
        1
    );

    constructor(private world: World) {
        // Set the default archetype, which isn't expected to have a lot of components
        this.archetypes.set(0, this.defaultArchetype);

        this.entityArchetypes = new Int32Array(
            new SharedArrayBuffer(
                Int32Array.BYTES_PER_ELEMENT * world.maxEntities
            )
        );
    }

    loadFromData(data: any): void {
        logger.log("Loading from data dump:", data);

        //@ts-ignore
        this.defaultArchetype = Object.create(
            Archetype.prototype,
            Object.getOwnPropertyDescriptors(data.defaultArchetype)
        );

        data.archetypes.forEach((archetype: Archetype, id: number) => {
            this.archetypes.set(
                id,
                Object.create(
                    Archetype.prototype,
                    Object.getOwnPropertyDescriptors(archetype)
                )
            );
        });

        //@ts-ignore
        this.entityArchetypes = data.entityArchetypes;
    }

    createNewArchetype(components: Set<number>) {
        logger.log("Creating new archetype for components:", components);

        const newArchetype = new Archetype(
            this.nextArchetypeId++,
            components,
            this.world.maxEntities
        );
        this.world.queryManager.onNewArchetypeCreated(newArchetype);
        this.world.workerManager.onNewArchetypeCreated(newArchetype);
        this.archetypes.set(newArchetype.id, newArchetype);

        return newArchetype;
    }

    getOrCreateArchetype(components: Set<number>): Archetype {
        for (const [_, archetype] of this.archetypes) {
            if (archetype.components.size !== components.size) continue;

            let hasAll = true;
            for (const needed of components) {
                if (!archetype.components.has(needed)) {
                    hasAll = false;
                    break;
                }
            }

            if (hasAll) return archetype;
        }

        return this.createNewArchetype(components);
    }

    moveWithoutGraph(entity: Entity, from: Archetype, to: Archetype) {
        from.removeEntity(entity);
        to.addEntity(entity);
        this.entityArchetypes[entity] = to.id;
    }

    addEntity(entity: Entity) {
        this.entityArchetypes[entity] = 0;
        this.defaultArchetype.addEntity(entity);
    }

    entityAddComponent(entity: Entity, component: number) {
        if (entity.has(component)) {
            logger.warn(
                "Entity",
                entity,
                "tried to add component (ID:",
                component,
                ") which it already had"
            );
            return;
        }
        // TODO: Make this faster
        const firstArchetype = this.archetypes.get(
            this.entityArchetypes[entity]
        )!;

        firstArchetype.removeEntity(entity);

        if (!firstArchetype.graph.added.has(component)) {
            // Slow route
            for (const [id, candidateArchetype] of this.archetypes.entries()) {
                // Check length to make it a bit faster
                if (
                    candidateArchetype.components.size ==
                    firstArchetype.components.size + 1
                ) {
                    // Make sure it has all the old ones plus the new one
                    if (
                        candidateArchetype.components.has(component) &&
                        firstArchetype.components.every((c) =>
                            candidateArchetype.components.has(c)
                        )
                    ) {
                        firstArchetype.graph.added.set(
                            component,
                            candidateArchetype
                        );

                        break;
                    }
                }
            }

            if (!firstArchetype.graph.added.has(component)) {
                // If we get here, we need to create a new archetype
                const newArchetype = this.createNewArchetype(
                    firstArchetype.components.concat(component)
                );
                firstArchetype.graph.added.set(component, newArchetype);
            }
        }

        // Finally add everything
        const newArchetype = firstArchetype.graph.added.get(component)!;
        newArchetype.addEntity(entity);
        this.entityArchetypes[entity] = newArchetype.id;
    }

    entityRemoveComponent(entity: Entity, component: number) {
        if (!entity.has(component)) {
            logger.warn(
                "Entity",
                entity,
                "tried to remove component (ID:",
                component,
                ") which it did not have"
            );
            return;
        }

        // Very similar to entityAddComponent, check there for comments
        const firstArchetype = this.archetypes.get(
            this.entityArchetypes[entity]
        )!;

        firstArchetype.removeEntity(entity);

        if (!firstArchetype.graph.removed.has(component)) {
            for (const [id, candidateArchetype] of this.archetypes) {
                if (
                    candidateArchetype.components.size ==
                    firstArchetype.components.size - 1
                ) {
                    if (
                        candidateArchetype.components.every(
                            (c) =>
                                c !== component &&
                                firstArchetype.components.has(c)
                        )
                    ) {
                        firstArchetype.graph.removed.set(
                            component,
                            candidateArchetype
                        );

                        break;
                    }
                }
            }

            if (!firstArchetype.graph.removed.has(component)) {
                const newArchetype = this.createNewArchetype(
                    firstArchetype.components.filter((x) => x !== component)
                );
                firstArchetype.graph.removed.set(component, newArchetype);
            }
        }

        const newArchetype = firstArchetype.graph.removed.get(component)!;
        newArchetype.addEntity(entity);
        this.entityArchetypes[entity] = newArchetype.id;
    }

    resize(maxEnts: number) {
        for (const [_, archetype] of this.archetypes) {
            archetype.resize(maxEnts);
        }
    }
}
