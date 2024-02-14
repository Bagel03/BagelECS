import { Logger } from "../utils/logger";
import { Class } from "../utils/types";
import type { Entity } from "./entity";
import {
    COMPONENT_STORAGES,
    ComponentStorage,
    StorageKind,
    addStorageKind,
} from "./storage";
import type { TypeId } from "./types";

const logger = new Logger("Custom Storages");

export type CustomComponentStorageOptions =
    | ({ type: typeof StorageKind.logged } & LoggedComponentStorageOptions)
    | ({ type: typeof StorageKind.enum } & EnumComponentStorageOptions)
    | ({ type: typeof StorageKind.nullable } & NullableComponentStorageOptions)
    | ({ type: typeof StorageKind.ranged } & RangedComponentStorageOptions);

export const CUSTOM_COMPONENT_STORAGES: Map<number, CustomComponentStorageOptions> =
    new Map();

export function loadCustomComponentStorages(
    customStorages: Map<number, CustomComponentStorageOptions>
) {
    logger.log("Loading custom storage classes from data dump:", customStorages);

    for (const [id, data] of customStorages) {
        COMPONENT_STORAGES.set(id, createCustomStorage(data.type, data));
    }
}

export const customComponentStorageCache: Record<number, Map<string, number>> = {
    10: new Map(),
    11: new Map(),
    12: new Map(),
    13: new Map(),
};

declare module "./storage" {
    interface StorageKind {
        readonly logged: TypeId<LoggedComponentStorage<any>> & 10;
        readonly enum: TypeId<EnumComponentStorage<any>> & 11;
        readonly nullable: TypeId<NullableComponentStorage<any>> & 12;
        readonly ranged: TypeId<RangedComponentStorage<any>> & 13;
    }
}

addStorageKind("logged", 10);
addStorageKind("enum", 11);
addStorageKind("nullable", 12);
addStorageKind("ranged", 13);

const customStorageFactories = {
    [StorageKind.logged]: createLoggedStorage,
    [StorageKind.enum]: createEnumComponentStorage,
    [StorageKind.nullable]: createNullableComponentStorage,
    [StorageKind.ranged]: createRangedComponentStorage,
} as any as Record<
    number,
    (
        id: number,
        options: CustomComponentStorageOptions
    ) => Class<ComponentStorage<any>>
>;

export function createCustomStorage(
    id: number,
    options: CustomComponentStorageOptions
): Class<ComponentStorage<any>> {
    return customStorageFactories[options.type](id, options);
}

export function registerCustomStorage(
    options: CustomComponentStorageOptions
): number {
    const optionsStr = JSON.stringify(options);

    if (customComponentStorageCache[options.type].has(optionsStr)) {
        return customComponentStorageCache[options.type].get(optionsStr)!;
    }

    const id = COMPONENT_STORAGES.size;

    customComponentStorageCache[options.type].set(optionsStr, id);

    const constructor = customStorageFactories[options.type](id, options);
    COMPONENT_STORAGES.set(id, constructor);
    CUSTOM_COMPONENT_STORAGES.set(id, options);
    return id;
}

/* Each custom component implementation storage has 3 parts
    - An interface:
        interface xyzComponentStorage extends ComponentStorage {}
        Holds typings for that kind of storage, as most of them are just extended classes
    
    - Options: 
        interface xyzComponentStorageOptions 
        The options that you pass into the constructor
    
    - A factory function:
        function createXYZStorage(id: number, options: Options): ComponentStorage
        It actually creates the storage class given the ID
*/

export let LOGGED_COMPONENT_STORAGE_BUFFER_SIZE = 15;
export function setDefaultLoggedStorageBufferSize(size: number) {
    LOGGED_COMPONENT_STORAGE_BUFFER_SIZE = size;
}

export interface LoggedComponentStorage<T> extends ComponentStorage<T> {
    rollback(numFrames: number, clearFuture?: boolean): void;
}

interface LoggedComponentStorageOptions {
    backingStorageId: number;
}

function createLoggedStorage<T>(
    id: number,
    { backingStorageId }: LoggedComponentStorageOptions
): Class<ComponentStorage<T>> {
    const superStorage = COMPONENT_STORAGES.get(backingStorageId)! as Class<
        ComponentStorage<T>
    >;

    return class LoggedStorage
        extends superStorage
        implements LoggedComponentStorage<T>
    {
        // private readonly bufferSize = bufferSize;
        public readonly needsUpdate: boolean = true;
        public readonly id: number = id;
        public readonly kind = StorageKind.logged;

        // This is a list of updates to stuff,
        public readonly log: ReadonlyArray<ReadonlyMap<Entity, T> | null> =
            new Array(LOGGED_COMPONENT_STORAGE_BUFFER_SIZE);
        private readonly writeableLog: (Map<Entity, T> | null)[] = this.log as any;

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
            if (
                this.writeableLog.unshift(null) >
                LOGGED_COMPONENT_STORAGE_BUFFER_SIZE
            )
                this.writeableLog.pop();
        }

        // This is the number of frames BEFORE the current frame to go back.
        // For example, rollback(0) will set the state back to the start of this frame
        rollback(numFrames: number) {
            if (numFrames > LOGGED_COMPONENT_STORAGE_BUFFER_SIZE) {
                logger.log(
                    "Can not rollback",
                    numFrames,
                    "frames, max buffer size is",
                    LOGGED_COMPONENT_STORAGE_BUFFER_SIZE,
                    "frames"
                );
                numFrames = LOGGED_COMPONENT_STORAGE_BUFFER_SIZE;
            }

            for (let i = 0; i < numFrames + 1; i++) {
                if (!this.log[i]) continue;

                this.log[i]!.forEach((val, ent) => {
                    super.addOrSetEnt(ent, val);
                });
            }
            this.writeableLog.splice(0, numFrames + 1);
        }
    };
}

export interface EnumComponentStorage<T extends string> extends ComponentStorage<T> {
    readonly options: ReadonlyArray<T>;
}

interface EnumComponentStorageOptions<T extends string = string> {
    options: T[];
}

// Ones that can be created
function createEnumComponentStorage<T extends string>(
    newId: number,
    { options }: EnumComponentStorageOptions<T>
) {
    return class EnumStorage
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
}

export interface NullableComponentStorage<T> extends ComponentStorage<T> {}
interface NullableComponentStorageOptions {
    backingStorageId: number;
}

function createNullableComponentStorage<T>(
    id: number,
    options: NullableComponentStorageOptions
) {
    const superStorage = COMPONENT_STORAGES.get(options.backingStorageId)! as Class<
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
}

/* 
    Ranged component storages only hold on to data for a range of entities, not World.maxEntityCount

    This is done by extending the backing storage and shifting the entity range to start at 0
*/
export interface RangedComponentStorage<T> extends ComponentStorage<T> {}
interface RangedComponentStorageOptions {
    backingStorageId: number;
    capacity: number;
}

function createRangedComponentStorage<T>(
    id: number,
    { backingStorageId, capacity }: RangedComponentStorageOptions
) {
    const superStorage = COMPONENT_STORAGES.get(backingStorageId)! as Class<
        ComponentStorage<T>
    >;

    return class RangedStorage
        extends superStorage
        implements RangedComponentStorage<T>
    {
        private first!: number;
        public readonly kind = StorageKind.ranged;

        constructor() {
            super(id, capacity);
        }

        addOrSetEnt(id: Entity, val: T): void {
            if (this.first === undefined) {
                this.first = id;
            }

            return super.addOrSetEnt((id - this.first) as Entity, val);
        }

        getEnt(id: Entity): T {
            return super.getEnt((id - this.first) as Entity);
        }

        deleteEnt(id: Entity): void {
            return super.deleteEnt((id - this.first) as Entity);
        }

        resize(maxEnts: number): void {
            return;
        }
    };
}
