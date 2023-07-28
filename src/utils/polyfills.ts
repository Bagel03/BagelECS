export function findGetter(
    obj: any,
    prop: PropertyKey
): (() => any) | undefined {
    while (obj) {
        const desc = Object.getOwnPropertyDescriptor(obj, prop);
        if (desc) {
            return desc.get;
        }
        obj = Object.getPrototypeOf(obj);
    }
}

export function findSetter(
    obj: any,
    prop: PropertyKey
): ((arg: any) => void) | undefined {
    while (obj) {
        const desc = Object.getOwnPropertyDescriptor(obj, prop);
        if (desc) {
            return desc.set;
        }
        obj = Object.getPrototypeOf(obj);
    }
}
