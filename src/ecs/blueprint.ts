import { Archetype } from "./archetype";
import {
    ExtractTypesFromTypeSignature,
    InternalComponent,
    TypeId,
} from "./component";
import { Entity } from "./entity";
import { World } from "./world";

export class Blueprint {
    private readonly archetype: Archetype;
    private readonly data = new Map<number, any>();

    constructor(...components: ({} | [tag: number, data?: any])[]) {
        const targetedComponents = new Set<number>();

        for (const arg of components) {
            if (Array.isArray(arg)) {
                targetedComponents.add(arg[0]);
                if (arg[1]) {
                    this.data.set(arg[0], arg[1]);
                }
            } else if (arg instanceof InternalComponent) {
                targetedComponents.add(arg.constructor.getId());

                const propIds = (arg.constructor as any).propertyIds;
                for (let i = 0; i < propIds.length; i++) {
                    this.data.set(propIds[i], arg.cachedValues[i]);
                }
            } else {
                const id = arg.constructor.getId();
                targetedComponents.add(id);
                this.data.set(id, arg);
            }
        }

        this.archetype =
            World.GLOBAL_WORLD.archetypeManager.getOrCreateArchetype(
                targetedComponents
            );
    }

    new() {
        const ent = World.GLOBAL_WORLD.spawn();

        for (const [key, value] of this.data) {
            const storage = World.GLOBAL_WORLD.storageManager.getStorage(
                key,
                value.storageType
            );

            if (value === null) continue;

            storage.addOrSetEnt(ent, value);
        }

        const manager = World.GLOBAL_WORLD.archetypeManager;

        manager.moveWithoutGraph(ent, manager.defaultArchetype, this.archetype);
        return ent;
    }

    factory<T extends TypeId[]>(
        ...options: T
    ): (...args: ExtractTypesFromTypeSignature<T>) => Entity {
        return BlueprintFactory(this, ...options);
    }
}

export interface BlueprintFactory {
    <T extends TypeId[]>(blueprint: Blueprint, ...options: T): (
        ...args: ExtractTypesFromTypeSignature<T>
    ) => Entity;
    <T extends TypeId[]>(
        components: ({} | [tag: number, data?: any])[],
        ...options: T
    ): (...args: ExtractTypesFromTypeSignature<T>) => Entity;
}

export function BlueprintFactory<T extends TypeId[]>(
    blueprint: Blueprint,
    ...options: T
): (...args: ExtractTypesFromTypeSignature<T>) => Entity;
export function BlueprintFactory<T extends TypeId[]>(
    components: ({} | [tag: number, data?: any])[],
    ...options: T
): (...args: ExtractTypesFromTypeSignature<T>) => Entity;

export function BlueprintFactory(bpOrComponents, ...options) {
    const bp =
        bpOrComponents instanceof Blueprint
            ? bpOrComponents
            : new Blueprint(...bpOrComponents);

    return (...args) => {
        const ent = bp.new();

        for (let i = options.length - 1; i > -1; i--) {
            ent.update(options[i], args[i]);
        }

        return ent;
    };
}
