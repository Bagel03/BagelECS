export type Class<T> = new (...args: any[]) => T;

export type FlatTreeBranch<T> =
    | T[]
    | {
          readonly [idx: string]: T;
      };

export type TreeBranch<T> =
    | Tree<T>[]
    | {
          readonly [idx: string]: Tree<T>;
      };

export type Tree<T> = T | TreeBranch<T>;

export type MatchingTree<T, Old, New> = T extends Record<string, Tree<Old>>
    ? {
          +readonly [key in keyof T]: MatchingTree<T[key], Old, New>;
      }
    : New;

export type NullableTree<T extends Tree<any>, U = any> = T extends U
    ? T | undefined
    : {
          [key in keyof T]: NullableTree<T[key], U>;
      };
// export type NullableTree<T extends Tree<any>, U = any> = T extends TreeBranch<U>
//     ? {
//           [K in keyof T]: NullableTree<T[K]>;
//       }
//     : T extends T[]
//     ? T
//     : T | undefined;

export type KeysOfObjWhere<O extends {}, W> = keyof {
    [key in keyof O as O[key] extends W ? key : never]: any;
};

export type DeepWriteable<T> = T extends Record<string, any>
    ? {
          -readonly [P in keyof T]: DeepWriteable<T[P]>;
      }
    : T;

export type FixedLengthArray<
    T,
    L extends number,
    A extends unknown[] = []
> = A["length"] extends L ? A : FixedLengthArray<T, L, [...A, T]>;

declare global {
    interface String {
        toLowerCase<T extends string>(this: T): Lowercase<T>;
    }

    interface ObjectConstructor {
        keys<T>(o: T): (T extends T ? keyof T : never)[];
        entries<T>(o: T): { [key in keyof T]: [key, T[key]] }[keyof T][];
    }

    interface Object {
        storageKind: number;
    }
}
