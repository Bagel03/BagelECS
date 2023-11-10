import { TypeId } from "../ecs/types";
import { Archetype } from "./archetype";
import {
    ComponentClass,
    EntityComponent,
    PODComponent,
    UnwrapTypeIdArray,
} from "./component";
import { Entity, intoID } from "./entity";
import { World } from "./world";

export class Blueprint {
    private archetype?: Archetype;
    private readonly defaultData = new Map<number, any>();
    private readonly targetedComponents = new Set<number>();

    private neededPropertyIds: number[] = [];
    private neededPropertyStorageKinds: number[] = [];

    constructor(...components: (intoID | {})[]) {
        for (const arg of components) {
            // Arg is internal component instance, copy all values into default data
            if (arg instanceof EntityComponent) {
                this.targetedComponents.add(arg.constructor.getId());

                const cache: any[] =
                    arg instanceof PODComponent ? [arg.cache] : arg.cache;

                for (let i = 0; i < arg.propIds.length; i++) {
                    this.defaultData.set(arg.propIds[i], cache[i]);
                }

                this.registerComponentProperties(arg.constructor);

                // Component w/o default data
            } else if (typeof arg === "function" || typeof arg === "number") {
                const id = typeof arg == "number" ? arg : arg.getId();
                this.targetedComponents.add(id);

                // If its also an internal component, make sure it's schema is properly initialized
                if (
                    typeof arg === "function" &&
                    arg.prototype instanceof EntityComponent
                ) {
                    this.registerComponentProperties(arg as ComponentClass);
                }

                // External component with default data
            } else {
                const id = arg.constructor.getId();
                this.targetedComponents.add(id);
                this.defaultData.set(id, arg);
            }
        }

        if (World.GLOBAL_WORLD) this.setupWithWorld(World.GLOBAL_WORLD);
    }

    private registerComponentProperties(componentClass: ComponentClass): void {
        this.neededPropertyIds.push(...componentClass.prototype.propIds);
        this.neededPropertyStorageKinds.push(
            ...componentClass.prototype.flattenedSchema
        );
    }

    private setupWithWorld(world: World) {
        this.archetype = world.archetypeManager.getOrCreateArchetype(
            this.targetedComponents
        );

        // Make sure all components + properties have storages
        for (let i = this.neededPropertyIds.length - 1; i > -1; i--) {
            // getStorage creates a new storage if one doesn't exist
            world.storageManager.getOrCreateStorage(
                this.neededPropertyIds[i],
                this.neededPropertyStorageKinds[i]
            );
        }
    }

    new() {
        if (!this.archetype) {
            this.setupWithWorld(World.GLOBAL_WORLD);
        }

        const ent = World.GLOBAL_WORLD.spawn();

        for (const [key, value] of this.defaultData) {
            const storage =
                World.GLOBAL_WORLD.storageManager.getOrCreateStorage(
                    key,
                    value.storageKind
                );

            storage.addOrSetEnt(ent, value);
        }

        const manager = World.GLOBAL_WORLD.archetypeManager;

        manager.moveWithoutGraph(
            ent,
            manager.defaultArchetype,
            this.archetype!
        );
        return ent;
    }

    factory<T extends TypeId[]>(
        ...options: T
    ): (...args: UnwrapTypeIdArray<T>) => Entity {
        return BlueprintFactory(this, ...options);
    }
}

export interface BlueprintFactory {
    <T extends TypeId[]>(blueprint: Blueprint, ...options: T): (
        ...args: UnwrapTypeIdArray<T>
    ) => Entity;
    <T extends TypeId[]>(components: (intoID | {})[], ...options: T): (
        ...args: UnwrapTypeIdArray<T>
    ) => Entity;
}

export function BlueprintFactory<T extends TypeId[]>(
    blueprint: Blueprint,
    ...options: T
): (...args: UnwrapTypeIdArray<T>) => Entity;
export function BlueprintFactory<T extends TypeId[]>(
    components: (intoID | {})[],
    ...options: T
): (...args: UnwrapTypeIdArray<T>) => Entity;

export function BlueprintFactory<T extends TypeId[]>(
    bpOrComponents: Blueprint | (intoID | {})[],
    ...options: T
) {
    const bp =
        bpOrComponents instanceof Blueprint
            ? bpOrComponents
            : new Blueprint(...bpOrComponents);

    return (...args: UnwrapTypeIdArray<T>): Entity => {
        const ent = bp.new();

        for (let i = options.length - 1; i > -1; i--) {
            ent.update(options[i], args[i]);
        }

        return ent;
    };
}

export function AdvancedBlueprintFactory<
    const TComponents extends TypeId[],
    const TFunc extends (this: Entity, ...args: any[]) => void,
    TArgs extends Parameters<TFunc> = Parameters<TFunc>
>(blueprint: Blueprint, components: TComponents, fn: TFunc) {
    return (
        ...args: [...data: UnwrapTypeIdArray<TComponents>, ...args: TArgs]
    ) => {
        const ent = blueprint.new();
        for (let i = components.length - 1; i > -1; i--) {
            ent.update(components[i], args[i]);
        }

        fn.call(ent, ...args.slice(components.length));
        return ent;
    };
}
