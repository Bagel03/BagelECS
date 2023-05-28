import { Class, Tree } from "../utils/types";
import {
    Component,
    ExtractTypesFromTypeSignature,
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

const logger = new Logger("Entities");

export type intoID = number | { getId(): number };

export interface EntityAPI {
    add(component: any, id?: intoID): void;
    update(component: any): void;
    update<T>(id: intoID | TypeId<T>, component: T): void;

    get<T>(id: intoID | TypeId<T>): T;
    get<T, C extends Class<T>>(component: C): T;
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
        TType extends ExtractTypesFromTypeSignature<TTypeID>,
        TKey extends string,
        TObject extends Record<TKey, TType>
    >(
        component: TTypeID,
        object: TObject,
        key: TKey
    ): void;
}

export type Entity = number & EntityAPI;

export const extraEntityMethodLoaders: (() => void)[] = [];
loadRelationshipMethods(extraEntityMethodLoaders);
loadHierarchyMethods(extraEntityMethodLoaders);

/** @internal */
export function loadEntityMethods() {
    //@ts-expect-error
    Number.prototype.add = function (
        this: Entity,
        component: any,
        id = component.constructor.getId()
    ) {
        World.GLOBAL_WORLD.archetypeManager.entityAddComponent(this, id);
        if (component instanceof InternalComponent) {
            const { propertyIds } = component.constructor as any;
            for (let i = 0; i < propertyIds.length; i++) {
                // Create the storage even if the value is null
                const storage = World.GLOBAL_WORLD.storageManager.getStorage(
                    propertyIds[i],
                    component.cachedValues[i].storageType
                );

                if (component.cachedValues[i] === null) continue;

                storage.addOrSetEnt(this, component.cachedValues[i]);
            }
            return;
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
        if (!component) component = valOrId;
        if (typeof valOrId !== "number") valOrId = valOrId.getId();

        if (component === null) return;

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
        key: string
    ): void {
        if (typeof component === "number") {
            World.GLOBAL_WORLD.storageManager.storages[component].link(
                object,
                key,
                this
            );
        } else {
            for (const key in Object.keys(component)) {
                this.link((component as any)[key], object[key], key);
            }
        }
    };

    extraEntityMethodLoaders.forEach((method) => method());
    logger.logOk("Loaded all entity polyfills");
}
