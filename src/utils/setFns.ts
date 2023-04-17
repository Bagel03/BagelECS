declare global {
    interface Set<T> {
        clone(): Set<T>;
        concat(...other: (Set<T> | T)[]): Set<T>;
        every(f: (arg: T) => boolean): boolean;
        filter(f: (arg: T) => boolean): Set<T>;
    }
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
        for (const v in this) {
            if (!fn(v)) return false;
        }
        return true;
    };

    Set.prototype.filter = function (fn) {
        const newSet = new Set();

        for (const v in this) {
            if (fn(v)) newSet.add(v);
        }
        return newSet;
    };
}
