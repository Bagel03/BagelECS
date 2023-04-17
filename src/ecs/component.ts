import { Logger } from "../utils/logger";
import { flattenTree } from "../utils/tree";
import {
    DeepWriteable,
    FixedLengthArray,
    KeysOfObjWhere,
    Tree,
} from "../utils/types";
import type { Entity } from "./entity";
import {
    registerEnumComponentStorage,
    registerNullableComponentStorage,
} from "./storage";

const logger = new Logger("Components")
declare global {
    interface Object {
        getId(): number;
    }
}

let nextComponentId: number = 0;
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

export function loadComponentMethods() {
    Object.prototype.getId = function () {
        return (ID_MAP[this.constructor.name] ??= getUniqueComponentId());
    };
    
    logger.logOk("Patched Object prototype, 3rd party external components are now available");
}

export type TypeId<T = any> = number & {
    _type: T;
};

export interface Type {
    readonly number: TypeId<number>;
    readonly bool: TypeId<boolean>;
    readonly any: TypeId<any>;

    readonly string: TypeId<string>;
    readonly entity: TypeId<Entity>;

    nullable<T>(
        type: TypeId<T> | KeysOfObjWhere<Type, number>
    ): TypeId<T | null>;
    custom<T>(type?: T): TypeId<T>;
    component<T>(component?: { schema: T }): TypeId<T>;
    enum<T extends string>(...options: T[]): TypeId<T>;

    tuple<const A extends any[], T extends {[key in keyof A]: TypeId<A[key]>}>(...args: T): T;

    vec<T, L extends number>(
        type: TypeId<T>,
        len: L
    ): FixedLengthArray<TypeId<T>, L>;
}

export const Type: Type = {
    number: 0 as TypeId<number>,
    bool: 1 as TypeId<boolean>,
    any: 2 as TypeId<any>,
    string: 2 as TypeId<string>,
    entity: 0 as TypeId<Entity>,

    nullable<T>(type: TypeId<T> | KeysOfObjWhere<Type, number>) {
        if (typeof type == "string") type = Type[type] as any;

        return registerNullableComponentStorage(
            type as TypeId<T>
        ) as TypeId<T | null>;
    },

    custom<T>(type?: T): TypeId<T> {
        const val = 2 as TypeId<T>;
        return val;
    },

    // Used a lot
    component<T>(component: { schema: T }): TypeId<T> {
        return component.schema as TypeId<T>;
    },

    enum<T extends string>(...options: T[]): TypeId<T> {
        return registerEnumComponentStorage(...options) as TypeId<T>;
    },

    tuple<const A extends TypeId[]>(...args: A) {
        return args as any;
    },

    vec<T, L extends number>(type: TypeId<T>, len: L) {
        return new Array(len).fill(type) as FixedLengthArray<T, L>;
    },
};

export class InternalComponent {
    /** @internal */
    public readonly cachedValues: any[] = [];
}

export function Component<
    S extends Record<string, Tree<TypeId>>,
    T extends ExtractTypesFromTypeSignatureTree<S>,
    M extends Record<string, (this: DeepWriteable<T>, ...args: any[]) => any>
>(schema: S, methods: M = {} as M) {
    class CustomFastComponent extends InternalComponent {
        constructor(data: T) {
            super();
            flattenTree(data, this.cachedValues);
        }

        static readonly id = getUniqueComponentId();

        static getId() {
            return CustomFastComponent.id;
        }

        static readonly propertyIds: number[] = [];

        static readonly entityRef: any = {};
        static currentEntity: Entity;

        static updatePropertyIds() {
            for (let i = 0; i < this.propertyIds.length; i++) {
                this.propertyIds[i] = ID_MAP[this.id + "-prop" + i];
            }
        }
        static readonly schema: S = schema;
    }

    // Init prop Id's &
    const ids = getIdsRecursiveThroughSchema(schema);
    for (const [key, val] of Object.entries(ids)) {
        //@ts-expect-error
        CustomFastComponent[key] = val;
    }

    // Init methods
    setEntityRefRecursiveThroughComponentIds(
        ids,
        CustomFastComponent.entityRef
    );
    for (const [key, method] of Object.entries(methods ?? {})) {
        //@ts-expect-error
        CustomFastComponent[key] = function (ent: Entity, ...args: any[]) {
            this.currentEntity = ent;
            method.apply(this.entityRef, args);
        };
    }

    return CustomFastComponent as any as {
        new (data: T): {};
        readonly schema: S;
        getId(): number;
    } & {
        [key in keyof M]: (
            ent: Entity,
            ...args: Parameters<M[key]>
        ) => ReturnType<M[key]>;
    } & UnwrapTypeSignatures<S>;

    function getIdsRecursiveThroughSchema(schema: Tree<TypeId>) {
        if (typeof schema == "number") {
            const propId = getUniqueComponentId();
            ID_MAP[
                CustomFastComponent.id +
                    "-prop" +
                    CustomFastComponent.propertyIds.length
            ] = propId;
            CustomFastComponent.propertyIds.push(propId);
            return propId;
        }

        let obj = {} as any;

        for (const [key, val] of Object.entries(schema)) {
            obj[key] = getIdsRecursiveThroughSchema(val);
        }

        return obj;
    }

    function setEntityRefRecursiveThroughComponentIds(
        ids: Tree<number>,
        currentObj: any
    ) {
        for (const [key, val] of Object.entries(ids)) {
            if (typeof val !== "number") {
                currentObj[key] = {};
                setEntityRefRecursiveThroughComponentIds(
                    (ids as any)[key],
                    currentObj[key]
                );
            } else {
                Object.defineProperty(currentObj, key, {
                    get(this: typeof CustomFastComponent) {
                        return this.currentEntity.get(val);
                    },
                    set(this: typeof CustomFastComponent, v) {
                        this.currentEntity.update(val, v);
                    },
                });
            }
        }
    }
}

// Shout out to chatGPT holy shit that thing is good
type UnwrapTypeSignatures<T> = T extends TypeId<infer U>
    ? U extends Record<string, TypeId>// check if U is an object to handle nested objects
        ? {
              +readonly [K in keyof U]: U[K] extends TypeId<any>
                  ? U[K]
                  : UnwrapTypeSignatures<U[K]>;
          }
        : T
    : T extends Record<string, TypeId> // handle nested objects directly
    ? { +readonly [K in keyof T]: UnwrapTypeSignatures<T[K]> }
    : T;

type ExtractTypesFromTypeSignatureTree<T extends Tree<any>> = {
    +readonly [K in keyof T]: T[K] extends TypeId<infer U>
        ? ExtractTypesFromTypeSignatureTree<U>
        : ExtractTypesFromTypeSignatureTree<T[K]>;
};
