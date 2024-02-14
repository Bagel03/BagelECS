import type { Entity } from "./entity";
import type { World } from "./world";

export class EntityManager {
    constructor(private readonly world: World) {}
    protected readonly entities: Set<Entity> = new Set();

    spawn(...components: (any | [any, number])[]): Entity {
        for (let i = 1; i <= this.entities.size + 1; i++) {
            const candidate = i as Entity;
            if (this.entities.has(candidate)) continue;

            for (const component of components) {
                if (Array.isArray(component)) {
                    candidate.add(component[0], component[1]);
                } else {
                    candidate.add(component);
                }
            }
            this.entities.add(candidate);

            return candidate;
        }
        throw new Error("Couldn't find free entity");
    }

    destroy(ent: Entity) {
        if (!this.entities.delete(ent)) {
            console.warn("removed entity that wasn't present in the world");
        }

        const from = this.world.archetypeManager.archetypes.get(
            this.world.archetypeManager.entityArchetypes[ent]
        )!;

        this.world.archetypeManager.moveWithoutGraph(
            ent,
            from,
            this.world.archetypeManager.defaultArchetype
        );
    }

    update() {
        // Nothing, used for multiplayer
    }
}
