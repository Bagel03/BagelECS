import { walk } from "../utils/walk";
import { Logger } from "../utils/logger";
import { FlatTreeBranch, Tree, TreeBranch } from "../utils/types";
import type { Entity } from "./entity";
import "./storage";
import {
    AsTypeIdTree,
    Type,
    TypeBuilder,
    TypeId,
    TypeIdBuilder,
    TypeTree,
    UnwrapTypeIdBuilder,
} from "./types";
import { World } from "./world";

const logger = new Logger("Components");

const CACHED_HASH = Symbol("CACHED_HASH");

declare global {
    interface Function {
        getId(): number;

        /** @internal */
        [CACHED_HASH]?: number;
    }

    interface String {
        getId(): number;
    }
}

/* OBJECT ID SETUP */

// Start at 1, because relationship components don't work if the relationship part is 0
let nextComponentId: number = 1;
export function getUniqueComponentId() {
    return nextComponentId++;
}

export const ID_MAP: Record<string, number> = {};
export const setIdMap = (map: Record<string, number>): void => {
    for (const key of Object.keys(ID_MAP)) {
        delete ID_MAP[key];
    }

    for (const [key, value] of Object.entries(map)) {
        ID_MAP[key] = value;
        nextComponentId = Math.max(nextComponentId, value);
    }
};

export type ObjectIDMethod =
    | "MANUALLY IMPLEMENTED"
    | "CONSTRUCTOR NAME"
    | "CONSTRUCTOR HASH";

export function setObjectIdImplementation(method: ObjectIDMethod) {
    switch (method) {
        case "MANUALLY IMPLEMENTED":
            Function.prototype.getId = function () {
                logger.error(
                    "Cannot get the ID of object:",
                    this,
                    `because the "MANUALLY_IMPLEMENTED" method of getId() was chosen `
                );
                throw new Error("Cannot get the ID of object");
            };
            break;

        case "CONSTRUCTOR HASH":
            Function.prototype.getId = function () {
                if (this[CACHED_HASH]) {
                    return this[CACHED_HASH];
                }

                const string = this.toString();
                let h!: number;
                for (let i = 0; i < string.length; i++)
                    h = (Math.imul(31, h) + string.charCodeAt(i)) | 0;

                this[CACHED_HASH] = h;
                return h;
            };
            break;

        case "CONSTRUCTOR NAME":
            Function.prototype.getId = function () {
                return (ID_MAP[this.name] ??= getUniqueComponentId());
            };
    }
}

export function markAsSuperclass(classHandle: { new (): any }) {
    const prototype = Object.getPrototypeOf(classHandle);
    classHandle.getId = function () {
        return prototype.getId();
    };
}

export function loadComponentMethods() {
    setObjectIdImplementation("CONSTRUCTOR NAME");

    String.prototype.getId = function (this: string) {
        return (ID_MAP[this] ??= getUniqueComponentId());
    };

    logger.log(
        "Patched Object prototype, 3rd party external components are now available"
    );
}

/* COMPONENT CLASSES */

export interface EntityComponent<T> {
    constructor: ComponentClass;
}
export abstract class EntityComponent<T> {
    abstract readonly schema: Tree<TypeId<any>>;

    declare readonly flattenedSchema: TypeId[];
    declare readonly propIds: number[];

    constructor(public cache: T) {}

    static readonly id: number;
    static getId() {
        return this.id;
    }

    static __init__(schema: Tree<TypeId<any>>) {
        //@ts-expect-error
        this.prototype.schema = schema;
    }

    abstract copyIntoStorage(world: World, ent: Entity): void;

    public static currentEntity: Entity;
}

// Throw in TypeId<T> so ent.get() recognizes the internal data
type PODCConstructor<T> = TypeId<T> &
    typeof PODComponent & {
        new (data: T): PODComponent<T>;
        prototype: PODComponent<T>;
    };
export class PODComponent<T> extends EntityComponent<T> {
    public declare readonly schema: TypeId<T>;

    public declare data: T;

    static __init__<T>(schema: TypeId<T>) {
        super.__init__(schema);

        //@ts-expect-error
        this.prototype.propIds = [this.getId()];
        //@ts-expect-error
        this.prototype.flattenedSchema = [schema];

        Object.defineProperty(this.prototype, "data", {
            get: () => {
                return this.currentEntity.get(this.getId()) as T;
            },
            set: (v) => {
                return this.currentEntity.update(this.getId(), v);
            },
        });
    }

    copyIntoStorage(world: World, ent: Entity): void {
        world.storageManager
            .getOrCreateStorage(
                this.constructor.getId(),
                (this.cache as any).storageKind
            )
            .addOrSetEnt(ent, this.cache);
    }
}

type RCConstructor<T extends Record<string, any>> = typeof RecordComponent & {
    readonly [K in keyof T]: TypeId<T[K]>;
} & {
    new (data: T): RecordComponent<T> & ExtraRCInstanceTypes<T>;
    prototype: RecordComponent<T>;
};

type ExtraRCInstanceTypes<T extends Record<string, any>> = {
    [K in keyof T]: T[K];
};
export class RecordComponent<T extends Record<string, any>> extends EntityComponent<
    T[keyof T][]
> {
    public declare readonly schema: { [K in keyof T]: TypeId<T[K]> };
    public declare readonly propNames: string[];

    constructor(data: T) {
        super([]);

        for (let i = this.propNames.length - 1; i > -1; i--) {
            this.cache[i] = data[this.propNames[i]];
        }
    }

    copyIntoStorage(world: World, ent: Entity): void {
        for (let i = this.flattenedSchema.length - 1; i > -1; i--) {
            world.storageManager
                .getOrCreateStorage(this.propIds[i], this.flattenedSchema[i])
                .addOrSetEnt(ent, this.cache[i]);
        }
    }

    static __init__<T extends Record<string, any>>(schema: {
        [K in keyof T]: TypeId<T[K]>;
    }) {
        //@ts-expect-error
        this.prototype.flattenedSchema = [];
        //@ts-expect-error
        (this.prototype.propIds = []), (this.prototype.propNames = []);

        for (const [key, type] of Object.entries(schema)) {
            const id = getUniqueComponentId();

            this.prototype.flattenedSchema.push(type);
            this.prototype.propIds.push(id);
            //@ts-expect-error
            this.prototype.propNames.push(key);

            //@ts-expect-error
            this[key] = id;

            Object.defineProperty(this.prototype, key, {
                get: () => {
                    return this.currentEntity.get(id);
                },
                set: (v) => {
                    return this.currentEntity.update(id, v);
                },
            });
        }

        super.__init__(schema);
    }
}

type NCConstructor<
    S extends Tree<TypeId>,
    T extends UnwrapTypeIdTree<S>
> = typeof NestedComponent & {
    readonly [K in keyof T]: TypeId<T[K]>;
} & {
    new (data: T): NestedComponent<S, T> & ExtraNCInstanceTypes<T>;
    prototype: NestedComponent<S, T>;
};

type ExtraNCInstanceTypes<T extends Record<string, any>> = {
    [K in keyof T]: T[K];
};
export class NestedComponent<
    S extends Tree<TypeId<any>>,
    T extends UnwrapTypeIdTree<S>
> extends EntityComponent<T[keyof T][]> {
    public declare readonly schema: S;

    constructor(data: T) {
        super([]);

        const queue: [schema: Tree<TypeId>, data: any][] = [[this.schema, data]];

        walk(([schema, data], add) => {
            if (typeof schema === "number") {
                this.cache.push(data);
                return;
            }

            for (const key of Object.keys(schema)) {
                add([schema[key], data[key]]);
            }
        }, queue);
    }

    copyIntoStorage(world: World, ent: Entity): void {
        for (let i = this.flattenedSchema.length - 1; i > -1; i--) {
            world.storageManager
                .getOrCreateStorage(this.propIds[i], this.flattenedSchema[i])
                .addOrSetEnt(ent, this.cache[i]);
        }
    }

    static __init__<S extends Tree<TypeId<any>>, T extends UnwrapTypeIdTree<S>>(
        schema: S
    ) {
        //@ts-expect-error
        (this.prototype.propIds = []), (this.prototype.flattenedSchema = []);

        const queue: [schema: any, targetObj: any, key: string][] = [
            [schema, this, "prototype"],
        ];

        walk(([schema, target, key], add) => {
            if (typeof schema === "number") {
                const id = getUniqueComponentId();

                Object.defineProperty(target, key, {
                    get: () => {
                        return this.currentEntity.get(id);
                    },
                    set: (v) => {
                        return this.currentEntity.update(id, v);
                    },
                });

                this.prototype.propIds.push(id);
                this.prototype.flattenedSchema.push(schema as TypeId);
                return;
            }

            for (const key of Object.keys(schema)) {
                add([schema[key], (target[key] = {}), key as string]);
            }
        }, ...queue);

        super.__init__(schema);
    }
}

export function Component<const T extends TypeTree>(
    schema: T
): ComponentClass<
    AsTypeIdTree<T> extends infer R
        ? R extends Tree<TypeId>
            ? R
            : TypeId<never>
        : TypeId<never>
> {
    const realSchema = convertTypeTreeToTypeIdTree(schema);

    if (typeof realSchema === "number") {
        class CustomComponent extends PODComponent<T> {
            static readonly id = getUniqueComponentId();
        }

        CustomComponent.__init__(realSchema as any);
        return CustomComponent as any;
    }

    if (isTypeIdRecord(realSchema)) {
        class CustomComponent extends RecordComponent<any> {
            static readonly id = getUniqueComponentId();
        }

        CustomComponent.__init__(realSchema);
        return CustomComponent as any;
    }

    class CustomComponent extends NestedComponent<any, any> {
        static readonly id = getUniqueComponentId();
    }

    CustomComponent.__init__(realSchema as any);
    return CustomComponent as any;
}

/* 
    Resources and components are exactly the same (they are actually stored as components on 
    a reserved "world" entity). However, having a different name helps the user to understand
    what goes where.
*/
export const Resource = Component;

export type ComponentClass<TSchema extends Tree<TypeId> = Tree<TypeId>> =
    TSchema extends TypeId
        ? PODCConstructor<UnwrapTypeIdTree<TSchema>>
        : TSchema extends FlatTreeBranch<TypeId>
        ? RCConstructor<UnwrapTypeIdTree<TSchema>>
        : NCConstructor<TSchema, UnwrapTypeIdTree<TSchema>>;

export type UnwrapTypeId<T extends TypeId> = T extends TypeId<infer U> ? U : never;
export type UnwrapTypeIdBuilderRecord<T extends Record<string, TypeIdBuilder>> = {
    [K in keyof T]: UnwrapTypeIdBuilder<T[K]>;
};

export type UnwrapTypeIdTree<T extends Tree<TypeId>> = T extends TypeId<infer U>
    ? U
    : T extends Record<string, Tree<TypeId>>
    ? {
          [K in keyof T as T[K] extends Tree<TypeId> ? K : never]: UnwrapTypeIdTree<
              T[K]
          >;
      }
    : never;

export type UnwrapTypeIdArray<T extends TypeId[]> = {
    [K in keyof T]: UnwrapTypeId<T[K]>;
} & { length: T["length"] };

function isTypeId<T>(schema: TypeTree): schema is TypeId<T> {
    return typeof schema === "number";
}

function isTypeIdBuilder<T>(schema: TypeTree): schema is TypeIdBuilder<T> {
    return schema instanceof TypeIdBuilder;
}

function isTypeIdRecord(schema: TypeTree): schema is Record<string, TypeId> {
    return Object.values(schema).every((t) => typeof t === "number");
}

function isTypeBuilder<T extends TypeTree>(
    schema: TypeTree
): schema is TypeBuilder<T> {
    return schema instanceof TypeBuilder;
}

function convertTypeTreeToTypeIdTree<T extends TypeTree>(
    schema: T
): AsTypeIdTree<T> extends infer R ? (R extends Tree<TypeId> ? R : never) : never {
    if (isTypeId(schema)) return schema as any;
    if (isTypeIdBuilder<T>(schema)) return schema.toTypeId() as any;
    if (isTypeBuilder<T>(schema))
        return convertTypeTreeToTypeIdTree(schema.toTypeTree());

    const obj = {} as any;
    for (const [key, val] of Object.entries(schema)) {
        // This is annoying, but we get an "excessively deep" error
        obj[key] = (convertTypeTreeToTypeIdTree as any)(val);
    }
    return obj as any;
}
