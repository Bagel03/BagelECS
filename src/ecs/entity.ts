import { Class, KeysOfObjWhere, Tree } from "../utils/types";
import {
    Component,
    ComponentClass,
    ExtractTypeId,
    ExtractTypesFromTypeSignatureTree,
    InternalComponent,
    Type,
    TypeId,
    UnwrapTypeSignatures,
} from "./component";
import { World } from "./world";
import { Logger } from "../utils/logger";
import { loadRelationshipMethods } from "./relationships";
import { loadHierarchyMethods } from "./hierarchy";
import { NumberComponentStorage } from "./storage";

const logger = new Logger("Entities");

export type intoID = number | { getId(): number };

export interface EntityAPI {
    readonly world: World;

    add(component: any, id?: intoID): void;
    update(component: any): void;
    update<T>(id: intoID | TypeId<T>, component: T): void;

    get<T extends ComponentClass<any, {}, TypeId>>(
        component: T
    ): T extends ComponentClass<any, {}, TypeId<infer U>> ? U : never;

    get<T extends Class<any>>(component: T): InstanceType<T>;
    get<T>(id: intoID | TypeId<T>): T;
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

    link<
        TTypeID extends Tree<TypeId>,
        TType extends ExtractTypeId<TTypeID>,
        TObject extends {},
        TKey extends KeysOfObjWhere<TObject, TType>
    >(
        component: TTypeID,
        object: TObject,
        key: TKey,
        slowBackwardsLink?: boolean
    ): void;

    getLinkInfo<T = any>(
        component: TypeId<T>
    ): [key: number | string, obj: Record<number | string, T>];

    // Useful number methods
    inc(component: TypeId<number>, amount: number): void;
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

        if (component instanceof InternalComponent) {
            const { propertyIds, propertyNames, schema } =
                component.constructor as any;

            if (propertyIds.length === 0) {
                // "Simple" component
                component = component.cachedValues;
            } else {
                for (let i = 0; i < propertyIds.length; i++) {
                    const storage =
                        World.GLOBAL_WORLD.storageManager.getStorage(
                            propertyIds[i],
                            schema[propertyNames[i]]
                        );

                    storage.addOrSetEnt(this, component.cachedValues[i]);
                }

                return;
            }
        }

        if (typeof id !== "number") {
            id = id.getId();
        }

        World.GLOBAL_WORLD.storageManager
            .getStorage(id, component.storageType)
            .addOrSetEnt(this, component);
    };

    //@ts-expect-error
    Number.prototype.update = function (this: Entity, valOrId, component) {
        if (component == null) component = valOrId;

        if (typeof valOrId == "string") valOrId = valOrId.getId();
        else if (typeof valOrId !== "number")
            valOrId = valOrId.constructor.getId();

        World.GLOBAL_WORLD.storageManager
            // It doesn't matter what storage kind we pass in, we know it already exists.
            .getStorage(valOrId, 0)
            .addOrSetEnt(this, component);
    };

    //@ts-expect-error
    Number.prototype.get = function (this: Entity, id) {
        if (typeof id !== "number") id = id.getId();

        return World.GLOBAL_WORLD.storageManager.storages[id].getEnt(this);
    };

    //@ts-expect-error
    Number.prototype.remove = function (this: Entity, id) {
        if (typeof id !== "number") id = id.getId();

        World.GLOBAL_WORLD.storageManager.storages[id]?.deleteEnt(this);
        World.GLOBAL_WORLD.archetypeManager.entityRemoveComponent(this, id);
    };

    //@ts-expect-error
    Number.prototype.has = function (this: Entity, id) {
        const { archetypes, entityArchetypes } =
            World.GLOBAL_WORLD.archetypeManager;

        return archetypes.get(entityArchetypes[this])!.components.has(id);
    };

    //@ts-expect-error
    Number.prototype.components = function (this: Entity) {
        const { archetypes, entityArchetypes } =
            World.GLOBAL_WORLD.archetypeManager;

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

    // @ts-expect-error
    Number.prototype.link = function (
        this: Entity,
        component: Tree<TypeId>,
        object: any,
        key: string,
        slowBackwardsLink: boolean = false
    ): void {
        if (typeof component === "number") {
            World.GLOBAL_WORLD.storageManager.storages[component].link(
                object,
                key,
                this,
                slowBackwardsLink
            );
        } else {
            for (const key in Object.keys(component)) {
                this.link((component as any)[key], object[key], key);
            }
        }
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
        amount: number
    ) {
        (
            World.GLOBAL_WORLD.storageManager.storages[
                component
            ] as NumberComponentStorage
        ).inc(this, amount);
    };

    //@ts-ignore
    Number.prototype.mult = function (
        this: Entity,
        component: TypeId<number>,
        amount: number
    ) {
        (
            World.GLOBAL_WORLD.storageManager.storages[
                component
            ] as NumberComponentStorage
        ).mult(this, amount);
    };

    //@ts-ignore
    Number.prototype.mod = function (
        this: Entity,
        component: TypeId<number>,
        modulo: number
    ) {
        (
            World.GLOBAL_WORLD.storageManager.storages[
                component
            ] as NumberComponentStorage
        ).mod(this, modulo);
    };

    extraEntityMethodLoaders.forEach((method) => method());
    logger.logOk("Loaded all entity polyfills");
}
