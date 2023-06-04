export type Class<T> = new (...args: any[]) => T;

export type Tree<T> =
    | T
    | T[]
    | {
          readonly [idx: string]: Tree<T>;
      }
    | {
          readonly [idx: number]: Tree<T>;
      };

export type MatchingTree<T, Old, New> = T extends Record<string, Tree<Old>>
    ? {
          +readonly [key in keyof T]: MatchingTree<T[key], Old, New>;
      }
    : New;

export type KeysOfObjWhere<O extends {}, W> = keyof {
    [key in keyof O as O[key] extends W ? key : never]: any;
};

export type DeepWriteable<T> = {
    -readonly [P in keyof T]: DeepWriteable<T[P]>;
};

export type FixedLengthArray<
    T,
    L extends number,
    A extends unknown[] = []
> = A["length"] extends L ? A : FixedLengthArray<T, L, [...A, T]>;
