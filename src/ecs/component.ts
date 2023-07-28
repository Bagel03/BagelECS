import { Logger } from "../utils/logger";
import { FixedLengthArray, KeysOfObjWhere, Tree } from "../utils/types";
import type { Entity } from "./entity";
import {
    registerEnumComponentStorage,
    registerNullableComponentStorage,
    registerLoggedComponentStorage,
} from "./custom_storages";

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

export function loadComponentMethods() {
    setObjectIdImplementation("CONSTRUCTOR NAME");

    String.prototype.getId = function (this: string) {
        return (ID_MAP[this] ??= getUniqueComponentId());
    };

    logger.logOk(
        "Patched Object prototype, 3rd party external components are now available"
    );
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
    logged<T>(type: TypeId<T>, bufferSize: number): TypeId<T>;

    tuple<
        const A extends any[],
        T extends { [key in keyof A]: TypeId<A[key]> }
    >(
        ...args: T
    ): T;

    vec<T, L extends number>(
        type: TypeId<T>,
        len: L
    ): FixedLengthArray<TypeId<T>, L>;
}

export const Type: Type = {
    any: 0 as TypeId<any>,
    number: 1 as TypeId<number>,
    bool: 2 as TypeId<boolean>,
    string: 0 as TypeId<string>,
    entity: 1 as TypeId<Entity>,

    nullable<T>(type: TypeId<T> | KeysOfObjWhere<Type, number>) {
        if (typeof type == "string") type = Type[type] as any;

        return registerNullableComponentStorage(
            type as TypeId<T>
        ) as TypeId<T | null>;
    },

    custom<T>(type?: T): TypeId<T> {
        return 0 as TypeId<T>;
    },

    // Used a lot
    component<T>(component: { schema: T }): TypeId<T> {
        return component.schema as TypeId<T>;
    },

    enum<T extends string>(...options: T[]): TypeId<T> {
        return registerEnumComponentStorage(...options) as TypeId<T>;
    },

    logged<T>(type: TypeId<T>, bufferSize: number): TypeId<T> {
        return registerLoggedComponentStorage(type, bufferSize) as TypeId<T>;
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
    public readonly cachedValues: any;
}

export type ComponentClass<
    T,
    TMethods extends Record<string, (this: T, ...args: any[]) => any[]>,
    TProps extends Record<string, TypeId> | TypeId
> = {
    new (data: T): {};
    getId(): number;
    readonly schema: TProps;
} & {
    [key in keyof TMethods]: (
        this: T,
        ...args: Parameters<TMethods[key]>
    ) => ReturnType<TMethods[key]>;
} & (TProps extends TypeId
        ? {}
        : {
              readonly [key in keyof TProps]: TProps[key];
          }) &
    Function;

export function Component<
    TSchema extends Record<string, TypeId> | TypeId,
    T extends ExtractTypesFromTypeSignatureTree<TSchema>,
    TMethods extends TSchema extends TypeId
        ? {}
        : Record<string, (this: T, ent: Entity, ...args: any[]) => any>
>(
    schema: TSchema,
    methods: TMethods = {} as TMethods
): ComponentClass<T, TMethods, TSchema> {
    class CustomFastComponent extends InternalComponent {
        static readonly id = getUniqueComponentId();

        static getId() {
            return CustomFastComponent.id;
        }

        static readonly propertyNames: string[] = [];
        static readonly propertyIds: number[] = [];

        constructor(data: T) {
            super();

            // Simple (1 type) component
            if (CustomFastComponent.propertyNames.length === 0) {
                //@ts-ignore
                this.cachedValues = data;
            } else {
                //@ts-ignore
                this.cachedValues = new Array(
                    CustomFastComponent.propertyNames.length
                ).fill({});

                for (
                    let i = CustomFastComponent.propertyNames.length - 1;
                    i > -1;
                    i--
                ) {
                    this.cachedValues[i] =
                        data[CustomFastComponent.propertyNames[i]];
                }
            }
        }

        static readonly entityRef: any = {};
        static currentEntity: Entity;

        static updatePropertyIds() {
            for (let i = 0; i < this.propertyIds.length; i++) {
                this.propertyIds[i] = ID_MAP[this.id + "-prop" + i];
            }
        }
        static readonly schema: TSchema = schema;
    }

    // Init methods and properties for complex components ({x: Type.number, y: Type.number})
    if (typeof schema !== "number") {
        // Init prop Id's, names, and entity Ref
        for (const key of Object.keys(schema)) {
            // Ids + names
            const id = getUniqueComponentId();
            ID_MAP[CustomFastComponent.id + "-" + key] = id;

            CustomFastComponent.propertyIds.push(id);
            CustomFastComponent.propertyNames.push(key);
            //@ts-expect-error
            CustomFastComponent[key] = id;

            // Init entityRef (used for methods)
            Object.defineProperty(CustomFastComponent.entityRef, key, {
                get(this: typeof CustomFastComponent) {
                    return this.currentEntity.get(id);
                },
                set(this: typeof CustomFastComponent, v) {
                    this.currentEntity.update(id, v);
                },
            });
        }

        // Init methods
        for (const [key, method] of Object.entries(methods)) {
            //@ts-expect-error
            CustomFastComponent[key] = function (
                ...args: [ent: Entity, ...args: any[]]
            ) {
                CustomFastComponent.currentEntity = args[0];
                method.apply(CustomFastComponent.entityRef, args);
            };
        }
    }

    return CustomFastComponent as any;
}

// Shout out to chatGPT holy that thing is good
export type UnwrapTypeSignatures<T> = T extends TypeId<infer U>
    ? U extends Record<string, TypeId> // check if U is an object to handle nested objects
        ? {
              +readonly [K in keyof U]: U[K] extends TypeId<any>
                  ? U[K]
                  : UnwrapTypeSignatures<U[K]>;
          }
        : T
    : T extends Record<string, TypeId> // handle nested objects directly
    ? { +readonly [K in keyof T]: UnwrapTypeSignatures<T[K]> }
    : T;

export type ExtractTypesFromTypeSignatureTree<T extends Tree<any>> =
    T extends TypeId<infer U>
        ? U
        : {
              +readonly [K in keyof T]: T[K] extends TypeId<infer U>
                  ? ExtractTypesFromTypeSignatureTree<U>
                  : ExtractTypesFromTypeSignatureTree<T[K]>;
          };

export type ExtractTypeId<T> = T extends TypeId<infer U>
    ? U
    : ExtractTypesFromTypeSignatureTree<T>;
