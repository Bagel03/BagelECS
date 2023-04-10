import { Entity } from "./entity";
import { World } from "./world";

export class Archetype {
    public readonly graph = {
        added: new Map<number, Archetype>(),
        removed: new Map<number, Archetype>(),
    };

    // Use the [length, ...data] syntax to sync archetypes between threads
    public readonly entities: Int32Array;

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
    }

    addEntity(entity: Entity) {
        // TODO: Check if max length is reached
        this.entities[++this.entities[0]] = entity;
    }

    removeEntity(entity: Entity) {
        for (let i = 1; i < this.entities[0]; i++) {
            if (this.entities[i] === entity) {
                // Swap the entity and the last one
                this.entities[i] = this.entities[this.entities[0]--];
                break;
            }
        }
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

    addEntity(entity: Entity) {
        this.entityArchetypes[entity] = 0;
        this.defaultArchetype.addEntity(entity);
    }

    entityAddComponent(entity: Entity, component: number) {
        // debugger;
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
                        firstArchetype.components.every((c) =>
                            candidateArchetype.components.has(c)
                        ) &&
                        candidateArchetype.components.has(component)
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
                const newArchetype = new Archetype(
                    this.nextArchetypeId++,
                    firstArchetype.components.concat(component),
                    this.world.maxEntities
                );
                this.world.queryManager.onNewArchetypeCreated(newArchetype);
                this.world.workerManager.onNewArchetypeCreated(newArchetype);
                this.archetypes.set(newArchetype.id, newArchetype);
                firstArchetype.graph.added.set(component, newArchetype);
            }
        }

        // Finally add everything
        const newArchetype = firstArchetype.graph.added.get(component)!;
        newArchetype.addEntity(entity);
        this.entityArchetypes[entity] = newArchetype.id;
    }

    entityRemoveComponent(entity: Entity, component: number) {
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
                const newArchetype = new Archetype(
                    this.nextArchetypeId++,
                    firstArchetype.components.filter((x) => x !== component),
                    5
                );
                this.world.queryManager.onNewArchetypeCreated(newArchetype);
                this.world.workerManager.onNewArchetypeCreated(newArchetype);
                this.archetypes.set(newArchetype.id, newArchetype);
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
