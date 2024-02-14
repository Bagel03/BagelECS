import { FixedLengthArray, Tree } from "../utils/types";
import { Entity } from "./entity";
import { StorageKind } from "./storage";
import { registerCustomStorage } from "./custom_storages";

export type TypeId<T = any> = number & {
    _type: T;
};

export function asTypeId<T>(val: number | string): TypeId<T> {
    return (typeof val === "number" ? val : val.getId()) as TypeId<T>;
}

export type TypeTreeLeaf = TypeId | TypeIdBuilder<any> | TypeBuilder<any>;
export type TypeTree = Tree<TypeTreeLeaf>; //Tree<TypeId | TypeIdBuilder | TypeBuilder<any>>;

export type AsTypeIdTree_Patch<T extends TypeTree> = AsTypeIdTree<TypeBuilder<T>>;
export type AsTypeIdTree<T extends TypeTree> = T extends TypeId
    ? T
    : T extends TypeIdBuilder<infer U>
    ? TypeId<U>
    : T extends TypeBuilder<infer V>
    ? AsTypeIdTree<V>
    : {
          [K in keyof T]: T[K] extends TypeTree ? AsTypeIdTree<T[K]> : never;
      };

export type ExtractTypeTree<T extends TypeTree> = T extends TypeId<infer U>
    ? U
    : T extends TypeIdBuilder<infer V>
    ? V
    : T extends TypeBuilder<infer W>
    ? AsTypeIdTree<W>
    : {
          [K in keyof T as T[K] extends TypeTree ? K : never]: T[K] extends TypeTree
              ? AsTypeIdTree<T[K]>
              : never;
      };

export type TypeIdBuilderTreeFromTypeIdTree<T extends Tree<TypeId>> =
    T extends TypeId<infer U>
        ? TypeIdBuilder<U>
        : {
              [key in keyof T]: T[key] extends Tree<TypeId>
                  ? TypeIdBuilderTreeFromTypeIdTree<T[key]>
                  : never;
          };

/** TypeIdBuilder represents all the methods you do on individual `typeId`'s, not collections  */
export class TypeIdBuilder<T = any> {
    constructor(public readonly id: TypeId<T>) {}
    toTypeId(): TypeId<T> {
        return this.id;
    }

    nullable(): TypeIdBuilder<T | null> {
        return new TypeIdBuilder(
            registerCustomStorage({
                type: StorageKind.nullable,
                backingStorageId: this.id,
            }) as any
        );
    }

    logged(): TypeIdBuilder<T> {
        return new TypeIdBuilder(
            registerCustomStorage({
                type: StorageKind.logged,
                backingStorageId: this.id,
            }) as any
        );
    }

    ranged(capacity: number): TypeIdBuilder<T> {
        return new TypeIdBuilder(
            registerCustomStorage({
                type: StorageKind.ranged,
                capacity,
                backingStorageId: this.id,
            }) as any
        );
    }

    vec<L extends number>(
        length: L
    ): TypeBuilder<FixedLengthArray<TypeIdBuilder<T>, L>> {
        return new TypeBuilder(
            new Array(length).fill(0).map((t) => new TypeIdBuilder(this.id)) as any
        );
    }
}

/** The type that this typeIdBuilder refers to
 * @example type UnwrapTypeIdBuilder<TypeIdBuilder<string>> = string
 */
export type UnwrapTypeIdBuilder<T extends TypeIdBuilder> = T extends TypeIdBuilder<
    infer U
>
    ? U
    : never;

type NullableTypeTree<T extends TypeTree> = T extends TypeId<infer U>
    ? TypeId<U | null>
    : T extends TypeIdBuilder<infer V>
    ? TypeIdBuilder<V | null>
    : T extends TypeBuilder<infer W>
    ? TypeBuilder<NullableTypeTree<W>>
    : {
          [key in keyof T as T[key] extends Tree<TypeTree>
              ? key
              : never]: T[key] extends Tree<TypeTree>
              ? NullableTypeTree<T[key]>
              : never;
      };

type TypeBuilderInstance<T extends TypeTree> = T extends TypeTreeLeaf
    ? TypeBuilder<T>
    : TypeBuilder<T> & T;

export class TypeBuilder<T extends TypeTree> {
    readonly #type: T;

    constructor(type: T) {
        this.#type = type;
        if (
            !(
                typeof this.#type === "number" ||
                this.#type instanceof TypeBuilder ||
                this.#type instanceof TypeIdBuilder
            )
        ) {
            for (const [key, val] of Object.entries(type)) {
                //@ts-expect-error
                this[key] = val;
            }
        }
    }

    toTypeTree(): T {
        return this.#type;
    }

    private static nullableRaw<T extends TypeTree>(type: T): NullableTypeTree<T> {
        if (type instanceof TypeIdBuilder) {
            return type.nullable() as any;
        }

        if (Array.isArray(type)) {
            return type.map((t) => this.nullableRaw(t as any)) as any;
        }

        const obj = {} as T;
        for (const [key, val] of Object.entries(type)) {
            obj[key] = this.nullableRaw(val as any) as any;
        }

        return obj as any;
    }

    nullable(): TypeBuilderInstance<NullableTypeTree<T>> {
        return new TypeBuilder(TypeBuilder.nullableRaw(this.#type)) as any;
    }

    private static loggedRaw<T extends TypeTree>(type: T): T {
        if (type instanceof TypeIdBuilder) {
            return type.logged() as any;
        }

        if (Array.isArray(type)) {
            return type.map((t) => this.loggedRaw(t)) as any;
        }

        const obj = {} as T;
        for (const [key, val] of Object.entries(type)) {
            obj[key] = this.loggedRaw(val as any);
        }

        return obj as any;
    }

    logged(): TypeBuilderInstance<T> {
        return new TypeBuilder(TypeBuilder.loggedRaw(this.#type)) as any;
    }

    private static rangedRaw<T extends TypeTree>(type: T, capacity: number): T {
        if (type instanceof TypeIdBuilder) {
            return type.ranged(capacity) as any;
        }

        if (Array.isArray(type)) {
            return type.map((t) => this.rangedRaw(t, capacity)) as any;
        }

        const obj = {} as T;
        for (const [key, val] of Object.entries(type)) {
            obj[key] = this.rangedRaw(val as any, capacity);
        }

        return obj as any;
    }

    ranged(capacity: number): TypeBuilderInstance<T> {
        return new TypeBuilder(TypeBuilder.rangedRaw(this.#type, capacity)) as any;
    }
}

/**  Default behavior of the `Type` function */
function TypeBuilderConstructor<T extends TypeTree>(
    type: T
): TypeBuilderInstance<T> {
    return new TypeBuilder(type) as any;
}

/**  Most basic primitive types (no functions) */
class BaseTypes {
    static readonly any = new TypeIdBuilder(asTypeId<any>(StorageKind.any));

    static readonly bool = new TypeIdBuilder(asTypeId<boolean>(StorageKind.bool));
    static readonly string = new TypeIdBuilder(asTypeId<string>(StorageKind.any));
    static readonly entity = new TypeIdBuilder(asTypeId<Entity>(StorageKind.i32));

    static readonly f64 = new TypeIdBuilder(asTypeId<number>(StorageKind.f64));
    static readonly f32 = new TypeIdBuilder(asTypeId<number>(StorageKind.f32));
    static readonly i8 = new TypeIdBuilder(asTypeId<number>(StorageKind.i8));
    static readonly i16 = new TypeIdBuilder(asTypeId<number>(StorageKind.i16));
    static readonly i32 = new TypeIdBuilder(asTypeId<number>(StorageKind.i32));
    static readonly u8 = new TypeIdBuilder(asTypeId<number>(StorageKind.u8));
    static readonly u16 = new TypeIdBuilder(asTypeId<number>(StorageKind.u16));
    static readonly u32 = new TypeIdBuilder(asTypeId<number>(StorageKind.u32));
    static readonly number = BaseTypes.f64;
}

/**  Function that can be used to create more complex base types */
class ComplexTypes {
    static custom = function <T>(type?: T) {
        return new TypeIdBuilder(asTypeId<T>(0));
    };

    static component = function <T extends TypeTree>(component: {
        schema: T;
    }): TypeBuilderInstance<T> {
        return new TypeBuilder(component.schema) as any;
    };

    static enum = function <T extends string>(...options: T[]): TypeIdBuilder<T> {
        return new TypeIdBuilder(
            registerCustomStorage({
                type: StorageKind.enum,
                options,
            }) as any
        );
    };
}

/** First class supported types that are very common */
export class FirstClassTypes {
    static readonly vec2 = TypeBuilderConstructor({
        x: BaseTypes.number,
        y: BaseTypes.number,
    });

    static readonly vec3 = TypeBuilderConstructor({
        x: BaseTypes.number,
        y: BaseTypes.number,
        z: BaseTypes.number,
    });

    static readonly rect = TypeBuilderConstructor({
        ...this.vec2,
        width: BaseTypes.number,
        height: BaseTypes.number,
    });

    static readonly circle = TypeBuilderConstructor({
        ...this.vec2,
        radius: BaseTypes.number,
    });

    static readonly directionStr = ComplexTypes.enum("UP", "DOWN", "LEFT", "RIGHT");
    static readonly rotationDirection = ComplexTypes.enum(
        "CLOCKWISE",
        "COUNTERCLOCKWISE"
    );
}

export const Type = Object.assign(
    TypeBuilderConstructor,
    BaseTypes,
    ComplexTypes,
    FirstClassTypes
);

export type Type = typeof Type;

// const y = Type({ hello: Type.string });
// type x = AsTypeIdTree<typeof y>;

// export const Type: Type = {
//     any: 0 as TypeIdBuilder<any>,
//     number: 1 as TypeIdBuilder<number>,
//     bool: 2 as TypeIdBuilder<boolean>,
//     string: 0 as TypeIdBuilder<string>,
//     entity: 1 as TypeIdBuilder<Entity>,

//     nullable(type) {
//         return registerCustomStorage({
//             type: StorageKind.nullable,
//             backingStorageId: type,
//         }) as any;
//     },

//     custom<T>(type?: T) {
//         return 0 as any;
//     },

//     component<T>(component: { schema: T }) {
//         return component.schema as any;
//     },

//     enum<T extends string>(...options: T[]) {
//         return registerCustomStorage({
//             type: StorageKind.enum,
//             options,
//         }) as any;
//     },

//     tuple<const A extends TypeId[]>(...args: A) {
//         return args as any;
//     },

//     vec<T, L extends number>(type: TypeId<T>, len: L) {
//         return new Array(len).fill(type) as FixedLengthArray<T, L>;
//     },

//     logged(type, bufferSize = Type.logged.defaultBufferSize!) {
//         if (typeof type === "number")
//             return registerCustomStorage({
//                 type: StorageKind.logged,
//                 bufferSize,
//                 backingStorageId: type,
//             }) as any;

//         // its an object
//         let obj = {} as typeof type;
//         for (const [key, value] of Object.entries(type)) {
//             obj[key as keyof typeof type] = Type.logged(
//                 value,
//                 bufferSize
//             ) as any;
//         }

//         return obj;
//     },

//     ranged(type, capacity) {
//         if (typeof type === "number")
//             return registerCustomStorage({
//                 type: StorageKind.ranged,
//                 capacity,
//                 backingStorageId: type,
//             }) as any;

//         let obj = {} as typeof type;
//         for (const [key, value] of Object.entries(type)) {
//             obj[key as keyof typeof type] = Type.ranged(value, capacity) as any;
//         }

//         return obj;
//     },
// };
