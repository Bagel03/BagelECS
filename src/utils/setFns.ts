declare global {
    interface ReadonlySet<T> {
        clone(): Set<T>;
        concat(...other: (Set<T> | T)[]): Set<T>;
        every(f: (arg: T) => boolean): boolean;
        some(f: (arg: T) => boolean): boolean;
        filter(f: (arg: T) => boolean): Set<T>;
        map<U>(f: (arg: T) => U): Set<U>;
    }

    interface Set<T> extends ReadonlySet<T> {}
}
export function loadSetMethods() {
    Set.prototype.clone = function () {
        return new Set(this);
    };

    Set.prototype.concat = function (...others) {
        const newSet = this.clone();

        for (const other of others) {
            if (other instanceof Set) {
                other.forEach((s) => newSet.add(s));
            } else {
                newSet.add(other);
            }
        }

        return newSet;
    };

    Set.prototype.every = function (fn) {
        for (const v of this) {
            if (!fn(v)) return false;
        }
        return true;
    };

    Set.prototype.filter = function (fn) {
        const newSet = new Set();

        for (const v of this) {
            if (fn(v)) newSet.add(v);
        }
        return newSet;
    };

    Set.prototype.some = function (fn) {
        for (const v of this) {
            if (fn(v)) return true;
        }

        return false;
    };

    Set.prototype.map = function <T, U>(
        this: Set<T>,
        fn: (arg: T) => U
    ): Set<U> {
        const set = new Set<U>();
        for (const value of this) {
            set.add(fn(value));
        }
        return set;
    };
}
