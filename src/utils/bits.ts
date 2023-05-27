export function getBits(number: number, start: number, end: number): number {
    return (number >> start) & ((1 << end) - 1);
}
