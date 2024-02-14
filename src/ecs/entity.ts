import { Class, KeysOfObjWhere, Tree } from "../utils/types";
import { Component, EntityComponent, PODComponent } from "./component";
import { World } from "./world";
import { Logger } from "../utils/logger";
import { loadRelationshipMethods } from "./relationships";
import { loadHierarchyMethods } from "./hierarchy";
import { AbstractNumberComponentStorage, F64ComponentStorage } from "./storage";
import { Type, TypeId } from "./types";

const logger = new Logger("Entities");

export type intoID = number | { getId(): number };

export interface EntityAPI {
    readonly world: World;

    add(component: any, id?: intoID): void;
    update<T>(id: intoID | TypeId<T>, component: T): void;
    update(component: any): void;

    set(component: any): void;
    set<T>(id: intoID | TypeId<T>, component: T): void;

    get<T>(typeId: TypeId<T>): T;
    // For calling methods on components (ent.get(Vector).add)
    // get<T extends Class<EntityComponent<any>>>(component: T): T;
    get<T extends Class<any>>(component: T): InstanceType<T>;
    get<T>(id: intoID): T;

    remove(id: intoID): void;
    has(id: intoID): boolean;

    components(): ReadonlySet<number>;

    tag(tag: intoID): void;
    removeTag(tag: intoID): void;

    getSlowRef(): {
        -readonly [key in keyof Type as Type[key] extends TypeId<infer U>
            ? Type[key]
            : never]: Type[key] extends TypeId ? Type[key]["_type"] : never;
    };

    getLinkInfo<T = any>(
        component: TypeId<T>
    ): [key: number | string, obj: Record<number | string, T>];

    // Useful number methods
    inc(component: TypeId<number>, amount?: number): void;
    mult(component: TypeId<number>, amount: number): void;
    mod(component: TypeId<number>, modulo: number): void;
}

export type Entity = number & EntityAPI;

export const extraEntityMethodLoaders: (() => void)[] = [];
loadRelationshipMethods(extraEntityMethodLoaders);
loadHierarchyMethods(extraEntityMethodLoaders);

/** @internal */
export function loadEntityMethods() {
    //@ts-ignore
    Object.defineProperty(Number.prototype, "world", {
        configurable: false,
        enumerable: false,
        get() {
            return World.GLOBAL_WORLD;
        },
    });

    //@ts-expect-error
    Number.prototype.add = function (
        this: Entity,
        component: any,
        id = component.constructor.getId()
    ) {
        World.GLOBAL_WORLD.archetypeManager.entityAddComponent(this, id);

        if (component instanceof EntityComponent) {
            component.copyIntoStorage(World.GLOBAL_WORLD, this);
            return;
        }

        if (typeof id !== "number") {
            id = id.getId();
        }

        World.GLOBAL_WORLD.storageManager
            .getOrCreateStorage(id, component.storageKind)
            .addOrSetEnt(this, component);
    };

    //@ts-expect-error
    Number.prototype.update = function (this: Entity, valOrId, component) {
        if (component == null) component = valOrId;

        if (typeof valOrId == "string") valOrId = valOrId.getId();
        else if (typeof valOrId !== "number") valOrId = valOrId.constructor.getId();

        World.GLOBAL_WORLD.storageManager
            // It doesn't matter what storage kind we pass in, we know it already exists.
            .getOrCreateStorage(valOrId, 0)
            .addOrSetEnt(this, component);
    };

    //@ts-expect-error
    Number.prototype.set = Number.prototype.update;

    //@ts-expect-error
    Number.prototype.get = function (this: Entity, id) {
        /* 
        By default, if a subclass of EntityComponent is passed in, we return 
        it after attaching ourselves. This is so we can access methods like so:

            ent.get(Vector).add(ent2)

        However, with PODComponents, a lot of the time we just want the data, not some
        random class that is returned by Component():

            const name = Component(Type.string);
            ent.get(Name) -> should be a string, is actually "class extends PODComponent<string>"

        We could just return the internal data of all PODComponents, but then we would be unable
        to use methods (which are desired in some cases):

            class Score extends Component(Type.number) {
                reset() {
                    this.data = 0;
                }
            }

            ent.get(Score).reset();
        
        So, we only return the internal data if the component is a direct subclass of PODComponent.
        In practice, this means components defined with `const x = Component()`. So components declared
        with class X extends Component(...) will always have methods attached.

            const Name = Component(Type.string)
            class Score extends COmponent(Type.number) {
                reset() {
                    this.data = 0
                }
            }

            ent.get(Name) -> string
            ent.get(Score) -> Score (with ent internally attached)

        We can tell if something is a direct subclass (1 level) by checking
            Object.getPrototypeOf(class) === PODComponent
        */

        // // Actually, ive given up on that rn
        // if (id.prototype instanceof PODComponent) {
        //     id = id.;
        // }

        // if (
        //     id.prototype instanceof EntityComponent &&
        //     Object.getPrototypeOf(id) !== PODComponent
        // ) {
        //     id.currentEntity = this;
        //     return id;
        // }

        if (typeof id !== "number") id = id.getId();

        return World.GLOBAL_WORLD.storageManager.storages[id].getEnt(this);
    };

    //@ts-expect-error
    Number.prototype.remove = function (this: Entity, id: intoID) {
        if (typeof id !== "number") id = id.getId();

        World.GLOBAL_WORLD.storageManager.storages[id]?.deleteEnt(this);
        World.GLOBAL_WORLD.archetypeManager.entityRemoveComponent(this, id);
    };

    //@ts-expect-error
    Number.prototype.has = function (this: Entity, id: intoID) {
        if (typeof id !== "number") id = id.getId();
        return World.GLOBAL_WORLD.archetypeManager.archetypes
            .get(World.GLOBAL_WORLD.archetypeManager.entityArchetypes[this])!
            .components.has(id);
    };

    //@ts-expect-error
    Number.prototype.components = function (this: Entity) {
        const { archetypes, entityArchetypes } = World.GLOBAL_WORLD.archetypeManager;

        return archetypes.get(entityArchetypes[this])!.components;
    };

    //@ts-expect-error
    Number.prototype.tag = function (this: Entity, tag) {
        if (typeof tag !== "number") tag = tag.getId();

        World.GLOBAL_WORLD.archetypeManager.entityAddComponent(this, tag);
    };

    //@ts-expect-error
    Number.prototype.removeTag = function (this: Entity, tag) {
        if (typeof tag !== "number") tag = tag.getId();

        World.GLOBAL_WORLD.archetypeManager.entityRemoveComponent(this, tag);
    };

    //@ts-expect-error
    Number.prototype.getSlowRef = function (this: Entity) {
        return new Proxy(
            {},
            {
                get: (target, p, receiver) => {
                    return this.get(p as any);
                },

                set: (target, p, newValue, receiver) => {
                    this.update(p as any, newValue);
                    return true;
                },
            }
        );
    };

    //@ts-ignore
    Number.prototype.getLinkInfo = function (
        this: Entity,
        component: TypeId
    ): [string | number, Record<string | number, any>] {
        return [
            this,
            World.GLOBAL_WORLD.storageManager.storages[component].internalArray,
        ];
    };

    //@ts-ignore
    Number.prototype.inc = function (
        this: Entity,
        component: TypeId<number>,
        amount: number = 1
    ) {
        //@ts-expect-error
        if (typeof component !== "number") component = component.getId();

        (
            World.GLOBAL_WORLD.storageManager.storages[
                component
            ] as AbstractNumberComponentStorage
        ).inc(this, amount);
    };

    //@ts-ignore
    Number.prototype.mult = function (
        this: Entity,
        component: TypeId<number>,
        amount: number
    ) {
        //@ts-expect-error
        if (typeof component !== "number") component = component.getId();

        (
            World.GLOBAL_WORLD.storageManager.storages[
                component
            ] as AbstractNumberComponentStorage
        ).mult(this, amount);
    };

    //@ts-ignore
    Number.prototype.mod = function (
        this: Entity,
        component: TypeId<number>,
        modulo: number
    ) {
        //@ts-expect-error
        if (typeof component !== "number") component = component.getId();

        (
            World.GLOBAL_WORLD.storageManager.storages[
                component
            ] as AbstractNumberComponentStorage
        ).mod(this, modulo);
    };

    extraEntityMethodLoaders.forEach((method) => method());
    logger.logOk("Loaded all entity polyfills");
}
