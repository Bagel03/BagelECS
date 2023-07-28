import { Class } from "../exports";
import { Archetype } from "./archetype";
import { ExtractTypeId, InternalComponent, Type, TypeId } from "./component";
import { Entity, intoID } from "./entity";
import { World } from "./world";

export class Blueprint {
    private archetype?: Archetype;
    private readonly defaultData = new Map<number, any>();
    private readonly targetedComponents = new Set<number>();

    private neededPropertyIds: number[] = [];
    private neededPropertyStorageKinds: number[] = [];

    constructor(
        ...components: (intoID | object | [name: intoID, data?: any])[]
    ) {
        for (const arg of components) {
            // Component + Default
            if (Array.isArray(arg)) {
                this.targetedComponents.add(arg[0]);
                if (arg[1]) {
                    this.defaultData.set(arg[0], arg[1]);
                }

                // Internal Component instance
            } else if (arg instanceof InternalComponent) {
                const ctr = arg.constructor as any;

                this.targetedComponents.add(ctr.getId());

                const propIds = ctr.propertyIds;
                if (propIds.length == 0) {
                    this.defaultData.set(ctr.getId(), arg.cachedValues);
                } else {
                    for (let i = 0; i < propIds.length; i++) {
                        this.defaultData.set(propIds[i], arg.cachedValues[i]);
                    }
                }

                this.registerComponentProperties(ctr);
                // Component w/o default data
            } else if (typeof arg === "function" || typeof arg === "number") {
                const id = typeof arg == "number" ? arg : arg.getId();
                this.targetedComponents.add(id);

                if (
                    typeof arg === "function" &&
                    arg.prototype instanceof InternalComponent
                ) {
                    this.registerComponentProperties(arg as any);
                }

                // Component with default data
            } else {
                const id = arg.constructor.getId();
                this.targetedComponents.add(id);
                this.defaultData.set(id, arg);
            }
        }

        if (World.GLOBAL_WORLD) this.setupWithWorld(World.GLOBAL_WORLD);
    }

    private registerComponentProperties(
        componentClass: Class<InternalComponent>
    ): void {
        const propIds = (componentClass as any).propertyIds;
        const schema = (componentClass as any).schema;
        const propNames = (componentClass as any).propertyNames;

        if (propIds.length === 0) {
            this.neededPropertyIds.push(componentClass.getId());
            this.neededPropertyStorageKinds.push(schema);
        } else {
            for (let i = 0; i < propIds.length; i++) {
                this.neededPropertyIds.push(propIds[i]);
                this.neededPropertyStorageKinds.push(schema[propNames[i]]);
            }
        }
    }

    private setupWithWorld(world: World) {
        this.archetype = world.archetypeManager.getOrCreateArchetype(
            this.targetedComponents
        );

        // Make sure all components + properties have storages
        for (let i = this.neededPropertyIds.length - 1; i > -1; i--) {
            // getStorage creates a new storage if one doesn't exist
            world.storageManager.getStorage(
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
            const storage = World.GLOBAL_WORLD.storageManager.getStorage(
                key,
                value.storageType
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
    ): (...args: ExtractTypeId<T>) => Entity {
        return BlueprintFactory(this, ...options);
    }
}

export interface BlueprintFactory {
    <T extends TypeId[]>(blueprint: Blueprint, ...options: T): (
        ...args: ExtractTypeId<T>
    ) => Entity;
    <T extends TypeId[]>(
        components: ({} | [tag: number, data?: any])[],
        ...options: T
    ): (...args: ExtractTypeId<T>) => Entity;
}

export function BlueprintFactory<T extends TypeId[]>(
    blueprint: Blueprint,
    ...options: T
): (...args: ExtractTypeId<T>) => Entity;
export function BlueprintFactory<T extends TypeId[]>(
    components: ({} | [tag: number, data?: any])[],
    ...options: T
): (...args: ExtractTypeId<T>) => Entity;

export function BlueprintFactory<T extends TypeId[]>(
    bpOrComponents: Blueprint | ({} | [tag: number, data?: any])[],
    ...options: T
) {
    const bp =
        bpOrComponents instanceof Blueprint
            ? bpOrComponents
            : new Blueprint(...bpOrComponents);

    return (...args: ExtractTypeId<T>): Entity => {
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
    return (...args: [...data: ExtractTypeId<TComponents>, ...args: TArgs]) => {
        const ent = blueprint.new();
        for (let i = components.length - 1; i > -1; i--) {
            ent.update(components[i], args[i]);
        }

        fn.call(ent, ...args.slice(components.length));
        return ent;
    };
}
