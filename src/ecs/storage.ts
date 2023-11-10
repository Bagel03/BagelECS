import { Logger } from "../utils/logger";
import { Class } from "../utils/types";
import { findGetter, findSetter } from "../utils/polyfills";
import { Entity } from "./entity";
import type { World } from "./world";
import { TypeId } from "./types";
import { UnwrapTypeId } from "./component";

const logger = new Logger("Component Storage");

export class StorageManager {
    public readonly storages: ComponentStorage[] = [];

    private readonly updateQueue: ComponentStorage[] = [];
    private readonly storagesByType = new Map<number, ComponentStorage[]>();

    constructor(public world: World) {}

    loadFromData(data: ComponentStorage[]) {
        logger.log("Loading from data dump:", data);
        data.forEach((storage, id) => {
            // Still need to actually create the class
            this.storages[id] = Object.create(
                COMPONENT_STORAGES.get(storage.id)!.prototype,
                Object.getOwnPropertyDescriptors(storage)
            );
        });
    }

    private createStorage(id: number, storageId: number): ComponentStorage {
        const StorageClass = COMPONENT_STORAGES.get(storageId)!;
        const storage = new StorageClass(id, this.world.maxEntities);

        if (storage.needsUpdate) this.updateQueue.push(storage);

        if (!this.storagesByType.has(storage.kind)) {
            this.storagesByType.set(storage.kind, [storage]);
        } else {
            this.storagesByType.get(storage.kind)!.push(storage);
        }

        logger.log(
            "Created new data storage for",
            id,
            "(Type:",
            storageId,
            ")"
        );

        return storage;
    }

    getOrCreateStorage(id: number, storageId: number) {
        if (this.storages[id]) return this.storages[id];

        this.storages[id] = this.createStorage(id, storageId);

        return this.storages[id];
    }

    resize(maxEnts: number) {
        for (let i = this.storages.length - 1; i >= 0; i--) {
            this.storages[i].resize(maxEnts);
        }
    }

    update() {
        for (let i = this.updateQueue.length - 1; i >= 0; i--) {
            this.updateQueue[i].update!();
        }
    }

    getAllByType<T extends TypeId<ComponentStorage>>(
        type: T
    ): ReadonlyArray<UnwrapTypeId<T>> {
        return (this.storagesByType.get(type) ?? []) as any;
    }
}

export interface StorageKind {
    readonly any: TypeId<AnyComponentStorage>;
    readonly number: TypeId<NumberComponentStorage>;
    readonly bool: TypeId<BooleanComponentStorage>;
}

export const StorageKind: StorageKind = {} as any;

export function addStorageKind<T extends keyof StorageKind>(
    name: T,
    id: number
) {
    //@ts-ignore
    StorageKind[name] = id;
}

addStorageKind("any", 0);
addStorageKind("number", 1);
addStorageKind("bool", 2);

export interface ComponentStorage<T = any> {
    getEnt(id: Entity): T;
    addOrSetEnt(id: Entity, val: T): void;
    deleteEnt(id: Entity): void;

    resize(maxEnts: number): void;

    // Id refers to the exact storage class, while kind refers to the kind of storage
    // For example, 2 enum storages with different options have the same kind but different ids
    readonly id: number;
    readonly kind: number;

    readonly needsUpdate: boolean;

    update?(): void;
}

export abstract class ComponentStorage<T = any> {
    public internalArray!: ArrayLike<T | number>;
    public readonly needsUpdate: boolean = false;

    constructor(public readonly id: number, size: number) {}

    link<T>(
        object: T,
        property: keyof T,
        entity: Entity,
        slowBackwardsLink: boolean = false
    ): void {
        if (slowBackwardsLink) {
            const getter = findGetter(object, property);
            const setter = findSetter(object, property);

            Object.defineProperty(this.internalArray, entity, {
                get: getter ? getter : () => object[property],
                set: setter ? setter : (v) => (object[property] = v),
                enumerable: true,
                configurable: true,
            });
        }

        Object.defineProperty(object, property, {
            get: () => this.getEnt(entity),
            set: (val) => this.addOrSetEnt(entity, val),
        });
    }
}

export class AnyComponentStorage extends ComponentStorage<any> {
    public internalArray: any[] = [];
    public readonly id = StorageKind.any;
    public readonly kind = StorageKind.any;

    getEnt(id: number) {
        return this.internalArray[id];
    }

    addOrSetEnt(id: number, val: any) {
        this.internalArray[id] = val;
    }

    deleteEnt(id: number) {
        delete this.internalArray[id];
    }

    resize(maxEnts: number): void {}
}

Object.defineProperty(Object.prototype, "storageKind", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: 0,
});

export class NumberComponentStorage extends ComponentStorage<number> {
    public internalArray: Float64Array;
    public readonly id = StorageKind.number;
    public readonly kind = StorageKind.number;

    constructor(id: number, maxEnts: number = 10) {
        super(id, maxEnts);

        this.internalArray = new Float64Array(
            new SharedArrayBuffer(Float64Array.BYTES_PER_ELEMENT * maxEnts)
        );

        // By default we use the faster x= operators in the number methods.
        // However, some wrapper storages might need to know about these changes
        // via addOrSetEnt. So if we are in a wrapper class, make sure to change these methods

        const newTarget = new.target as any;
        if (newTarget !== NumberComponentStorage && !newTarget.patchedByNCS) {
            new.target.prototype.inc = function (ent, amount = 1) {
                this.addOrSetEnt(ent, this.getEnt(ent) + amount);
            };
            new.target.prototype.mult = function (ent, amount) {
                this.addOrSetEnt(ent, this.getEnt(ent) * amount);
            };
            new.target.prototype.mod = function (ent, modulo) {
                this.addOrSetEnt(ent, this.getEnt(ent) % modulo);
            };

            newTarget.patchedByNCS = true;
        }
    }

    resize(maxEnts: number): void {
        const old = this.internalArray;
        this.internalArray = new Float64Array(
            new SharedArrayBuffer(Float64Array.BYTES_PER_ELEMENT * maxEnts)
        );
        this.internalArray.set(old);
    }

    getEnt(id: number) {
        return this.internalArray[id];
    }

    deleteEnt(id: number): void {
        // Could be unsafe, but getting it will just return the old one
    }

    addOrSetEnt(id: number, val: number): void {
        this.internalArray[id] = val;
    }

    inc(ent: Entity, amount: number) {
        this.internalArray[ent] += amount;
    }

    mult(ent: Entity, amount: number) {
        this.internalArray[ent] *= amount;
    }

    mod(ent: Entity, modulo: number) {
        this.internalArray[ent] %= modulo;
    }
}

Object.defineProperty(Number.prototype, "storageKind", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: 1,
});

export class BooleanComponentStorage extends ComponentStorage<boolean> {
    public internalArray: Uint8Array;

    public readonly id: number = StorageKind.bool;
    public readonly kind: number = StorageKind.bool;

    constructor(id: number, maxEnts: number) {
        super(id, maxEnts);
        this.internalArray = new Uint8Array(
            new SharedArrayBuffer(Uint8Array.BYTES_PER_ELEMENT * maxEnts)
        );
    }

    getEnt(id: number): boolean {
        return !!this.internalArray[id];
    }

    addOrSetEnt(id: number, val: boolean): void {
        this.internalArray[id] = +val;
    }

    deleteEnt(id: number): void {
        // this.internalArray[id] = 2;
    }

    resize(maxEnts: number): void {
        const old = this.internalArray;
        this.internalArray = new Uint8Array(
            new SharedArrayBuffer(Uint8Array.BYTES_PER_ELEMENT * maxEnts)
        );
        this.internalArray.set(old);
    }
}

Object.defineProperty(Boolean.prototype, "storageKind", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: 2,
});

export const COMPONENT_STORAGES: Map<
    number,
    Class<ComponentStorage>
> = new Map();

COMPONENT_STORAGES.set(0, AnyComponentStorage);
COMPONENT_STORAGES.set(1, NumberComponentStorage);
COMPONENT_STORAGES.set(2, BooleanComponentStorage);
