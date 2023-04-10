import { Class } from "../utils/types";
import { Entity } from "./entity";
import { World } from "./world";

export class StorageManager {
    public readonly storages: ComponentStorage[] = [];

    constructor(public world: World) {}

    loadFromData(data: ComponentStorage[]) {
        data.forEach((storage, id) => {
            // Still need to actually create the class
            this.storages[id] = Object.create(
                COMPONENT_STORAGES.get(storage.storageKind)!.prototype,
                Object.getOwnPropertyDescriptors(storage)
            );
        });
    }

    getStorage(id: number, storageId: number) {
        if (this.storages[id]) return this.storages[id];

        // console.warn(
        //     "Creating new storage, make sure to sync workers before next update"
        // );

        this.storages[id] = new (COMPONENT_STORAGES.get(storageId)!)(
            id,
            this.world.maxEntities
        );
        return this.storages[id];
    }

    resize(maxEnts: number) {
        for (let i = this.storages.length - 1; i >= 0; i--) {
            this.storages[i].resize(maxEnts);
        }
    }
}

export abstract class ComponentStorage<T = any> {
    constructor(public readonly id: number, size: number) {}

    abstract getEnt(id: number): T;
    abstract addEnt(id: number, val: T): void;
    abstract deleteEnt(id: number): void;

    abstract resize(maxEnts: number): void;

    abstract readonly storageKind: number;
}

export class AnyComponentStorage extends ComponentStorage<any> {
    private internalArr: any[] = [];
    public readonly storageKind = 0;

    getEnt(id: number) {
        return this.internalArr[id];
    }

    addEnt(id: number, val: any) {
        this.internalArr[id] = val;
    }

    deleteEnt(id: number) {
        delete this.internalArr[id];
    }

    resize(maxEnts: number): void {}
}

//@ts-expect-error
Object.prototype.storageType = 0;

export class NumberComponentStorage extends ComponentStorage<number> {
    private internalArray: Float64Array;
    public readonly storageKind = 1;

    constructor(id: number, maxEnts: number = 10) {
        super(id, maxEnts);

        this.internalArray = new Float64Array(
            new SharedArrayBuffer(Float64Array.BYTES_PER_ELEMENT * maxEnts)
        );
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

    addEnt(id: number, val: number): void {
        this.internalArray[id] = val;
    }
}

//@ts-ignore
Number.prototype.storageType = 1;

export class BooleanComponentStorage extends ComponentStorage<boolean> {
    private internalArray: Uint8Array;
    public readonly storageKind: number = 2;

    constructor(id: number, maxEnts: number) {
        super(id, maxEnts);
        this.internalArray = new Uint8Array(
            new SharedArrayBuffer(Uint8Array.BYTES_PER_ELEMENT * maxEnts)
        );
    }

    getEnt(id: number): boolean {
        return !!this.internalArray[id];
    }

    addEnt(id: number, val: boolean): void {
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

// Ones that can be created
const createEnumComponentStorage = <T extends string>(
    id: number,
    options: T[]
) =>
    class EnumComponentStorage extends ComponentStorage<T> {
        private internalArray: Uint8Array;
        private internalMap?: Map<any, number>;
        public storageKind: number = id;

        constructor(id: number, maxEnts: number) {
            super(id, maxEnts);
            this.internalArray = new Uint8Array(
                new SharedArrayBuffer(Uint8Array.BYTES_PER_ELEMENT * maxEnts)
            );

            // See what happens when we used a map and not an array + indexof
            if (options.length > 20) {
            }
        }

        getEnt(id: number): T {
            return options[this.internalArray[id]];
        }

        addEnt(id: number, value: T): void {
            this.internalArray[id] = options.indexOf(value);
        }

        deleteEnt(id: number): void {
            // this.internalData[id] = 0;
        }

        resize(maxEnts: number): void {
            const old = this.internalArray;
            this.internalArray = new Uint8Array(
                new SharedArrayBuffer(Uint8Array.BYTES_PER_ELEMENT * maxEnts)
            );
            this.internalArray.set(old);
        }
    };

export const registerEnumComponentStorage = <T extends string>(
    ...options: T[]
) => {
    // Get the next id
    const id = COMPONENT_STORAGES.size;
    const EnumComponentStorage = createEnumComponentStorage(id, options);

    COMPONENT_STORAGES.set(id, EnumComponentStorage);
    CUSTOM_COMPONENT_STORAGES.set(id, {
        type: "enum",
        options,
    });
    return id;
};

const createNullableComponentStorage = <T>(
    id: number,
    originalStorageId: number
) => {
    const superStorage = COMPONENT_STORAGES.get(originalStorageId)!;

    return class NullableComponentStorage
        extends (superStorage as any)
        implements ComponentStorage<T>
    {
        private readonly nullValues: Set<number> = new Set();
        public readonly storageKind: number = id;

        declare id: number;

        addEnt(id: number, val: T): void {
            if (val == null) {
                this.nullValues.add(id);
            } else {
                super.addEnt(id, val);
            }
        }

        getEnt(id: number): T {
            if (this.nullValues.has(id)) return null as any;
            return super.getEnt(id);
        }

        resize(maxEnts: number): void {
            super.resize(maxEnts);
        }

        deleteEnt(id: number): void {
            super.deleteEnt(id);
        }
    };
};

export const registerNullableComponentStorage = <T>(
    originalStorageId: number
) => {
    const id = COMPONENT_STORAGES.size;
    const storage = createNullableComponentStorage(id, originalStorageId);

    COMPONENT_STORAGES.set(id, storage);
    CUSTOM_COMPONENT_STORAGES.set(id, {
        type: "nullable",
        originalStorageId,
    });
    return id;
};

export const COMPONENT_STORAGES: Map<
    number,
    Class<ComponentStorage>
> = new Map();

COMPONENT_STORAGES.set(0, AnyComponentStorage);
COMPONENT_STORAGES.set(1, NumberComponentStorage);

export const CUSTOM_COMPONENT_STORAGES: Map<number, any> = new Map();
export function loadCustomComponentStorages(customStorages: Map<number, any>) {
    for (const [id, data] of customStorages) {
        switch (data.type) {
            case "enum": {
                const storage = createEnumComponentStorage(id, data.options);
                COMPONENT_STORAGES.set(id, storage);
            }
            case "nullable": {
                const storage = createNullableComponentStorage(
                    id,
                    data.originalId
                );
                COMPONENT_STORAGES.set(id, storage);
            }
        }
    }
}
