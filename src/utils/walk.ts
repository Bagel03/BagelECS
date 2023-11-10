export function walk<const T>(
    fn: (arg: T, add: (arg: T) => void) => T[] | void,
    ...initialData: T[]
) {
    while (initialData.length) {
        const res = fn(initialData.pop()!, initialData.push);
        if (res == null) continue;

        initialData.push(...res);
    }
}
