import { Logger } from "../utils/logger";
import { Class } from "../utils/types";
import { TypeId } from "./component";
import { Entity } from "./entity";
import {
    COMPONENT_STORAGES,
    ComponentStorage,
    StorageKind,
    addStorageKind,
} from "./storage";

const logger = new Logger("Custom Storages");

export const CUSTOM_COMPONENT_STORAGES: Map<number, any> = new Map();
export function loadCustomComponentStorages(customStorages: Map<number, any>) {
    logger.log(
        "Loading custom storage classes from data dump:",
        customStorages
    );

    for (const [id, data] of customStorages) {
        switch (data.type) {
            case "enum": {
                const storage = createEnumComponentStorage(id, data.options);
                COMPONENT_STORAGES.set(id, storage);
                break;
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

declare module "./storage" {
    export interface StorageKind {
        readonly logged: TypeId<LoggedComponentStorage<any>>;
        readonly enum: TypeId<EnumComponentStorage<any>>;
        readonly nullable: TypeId<NullableComponentStorage<any>>;
    }
}

addStorageKind("logged", 3);
addStorageKind("enum", 4);
addStorageKind("nullable", 5);

export interface LoggedComponentStorage<T> extends ComponentStorage<T> {
    rollback(numFrames: number, clearFuture?: boolean): void;
}

function createLoggedStorage<T>(
    id: number,
    originalStorageId: number,
    bufferSize: number
): Class<ComponentStorage<T>> {
    const superStorage = COMPONENT_STORAGES.get(originalStorageId)! as Class<
        ComponentStorage<T>
    >;

    return class LoggedStorage
        extends superStorage
        implements LoggedComponentStorage<T>
    {
        private readonly bufferSize = bufferSize;
        public readonly needsUpdate: boolean = true;
        public readonly id: number = id;
        public readonly kind = StorageKind.logged;

        // This is a list of updates to stuff,
        public readonly log: ReadonlyArray<ReadonlyMap<Entity, T> | null> =
            new Array(bufferSize);
        private readonly writeableLog: (Map<Entity, T> | null)[] = this
            .log as any;

        addOrSetEnt(id: Entity, val: any): void {
            if (!this.log[0]) {
                this.writeableLog[0] = new Map();
            }

            const map = this.writeableLog[0]!;

            // I want to keep track of what the value was at the start of this frame
            // that way when we rollback we go to that value
            // The next time something is set we will log the value that is now in there
            // in the event that a value is changed more than once a frame, we want to keep the
            // beginning value, which is why we make sure the map doesn't already have the entity
            if (!map.has(id)) {
                map.set(id, super.getEnt(id));
            }

            super.addOrSetEnt(id, val);
        }

        update() {
            if (this.writeableLog.unshift(null) > this.bufferSize)
                this.writeableLog.pop();
        }

        // This is the number of frames BEFORE the current frame to go back.
        // For example, rollback(0) will set the state back to the start of this frame
        rollback(numFrames: number, clearFuture: boolean = false) {
            if (numFrames > this.bufferSize) {
                logger.log(
                    "Can not rollback",
                    numFrames,
                    "frames, max buffer size is",
                    this.bufferSize,
                    "frames"
                );
                numFrames = this.bufferSize;
            }

            for (let i = 0; i < numFrames + 1; i++) {
                if (!this.log[i]) continue;

                this.log[i]!.forEach((val, ent) => {
                    super.addOrSetEnt(ent, val);
                });
            }
            if (clearFuture) this.writeableLog.splice(0, numFrames + 1);
        }
    };
}

const loggedStorageCache = new Map<string, number>();

export function registerLoggedComponentStorage(
    originalStorageId: number,
    bufferSize: number
) {
    if (loggedStorageCache.has(originalStorageId + "-" + bufferSize)) {
        return loggedStorageCache.get(originalStorageId + "-" + bufferSize)!;
    }

    const id = COMPONENT_STORAGES.size;

    const storage = createLoggedStorage(id, originalStorageId, bufferSize);

    COMPONENT_STORAGES.set(id, storage);
    CUSTOM_COMPONENT_STORAGES.set(id, {
        type: "logged",
        originalStorageId,
        rollbackDepth: bufferSize,
    });
    loggedStorageCache.set(originalStorageId + "-" + bufferSize, id);

    return id;
}

export interface EnumComponentStorage<T extends string>
    extends ComponentStorage<T> {
    readonly options: ReadonlyArray<T>;
}

// Ones that can be created
const createEnumComponentStorage = <T extends string>(
    newId: number,
    options: T[]
) =>
    class EnumStorage
        extends ComponentStorage<T>
        implements EnumComponentStorage<T>
    {
        public internalArray: Uint8Array;
        private internalMap?: Map<any, number>;
        public readonly id: number = newId;
        public readonly kind = StorageKind.enum;

        public readonly options: ReadonlyArray<T> = options;

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

        addOrSetEnt(id: number, value: T): void {
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

export interface NullableComponentStorage<T> extends ComponentStorage<T> {}

const createNullableComponentStorage = <T>(
    id: number,
    originalStorageId: number
) => {
    const superStorage = COMPONENT_STORAGES.get(originalStorageId)! as Class<
        ComponentStorage<T>
    >;

    return class NullableStorage
        extends superStorage
        implements NullableComponentStorage<T>
    {
        private readonly nullValues: Set<number> = new Set();
        public readonly id: number = id;
        public readonly kind = StorageKind.nullable;

        addOrSetEnt(id: Entity, val: T): void {
            if (val == null) {
                this.nullValues.add(id);
            } else {
                super.addOrSetEnt(id, val);
            }
        }

        getEnt(id: Entity): T {
            if (this.nullValues.has(id)) return null as any;
            return super.getEnt(id);
        }

        resize(maxEnts: number): void {
            super.resize(maxEnts);
        }

        deleteEnt(id: Entity): void {
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
