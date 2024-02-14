import { Logger } from "../utils/logger";

const logger = new Logger("Worker Thread");
logger.groupCollapsed("Worker thread created");

import { StorageManager } from "./storage";
import { BagelSystem } from "./system";
import { MessageType } from "./worker_manager";
import { World } from "./world";
import { Archetype } from "./archetype";
import { loadComponentMethods, setIdMap } from "./component";
import { Class } from "../utils/types";
import { loadEntityMethods } from "./entity";
import { loadSetMethods } from "../utils/setFns";
import { loadCustomComponentStorages } from "./custom_storages";

// We want to log these ourselves
logger.groupCollapsed("Load worker thread methods");
loadEntityMethods();
loadSetMethods();
loadComponentMethods();
logger.groupEnd();

// Init world stuff
const GLOBAL_WORLD = new World(100);

// Init entity /component stuff (Disable stuff)
{
    //@ts-expect-error
    Number.prototype.add = function (
        component: any,
        id: number = component.getId()
    ) {
        console.warn("Components can not be added or removed by worker systems");
    };

    //@ts-expect-error
    Number.prototype.delete = function (id: number) {
        console.warn("Components can not be added or removed by worker systems");
    };

    StorageManager.prototype.getOrCreateStorage = function (id: number) {
        if (this.storages[id]) return this.storages[id];
        // This should never happen, as new components couldn't be added in the first place
        throw new Error("Can not create new storage type inside of workers");
    };
}

logger.groupEnd();
let SYSTEM: BagelSystem<any>;
let SystemClass: Class<BagelSystem<any>> & { id: number };

export function registerRemoteSystem(
    system: Class<BagelSystem<any>> & { id: number }
) {
    SystemClass = system;
}

onmessage = async function workerSystemOnMessage(ev) {
    switch (ev.data.type) {
        case MessageType.init: {
            logger.groupCollapsed("Initializing worker thread");

            loadCustomComponentStorages(ev.data.customStorages);
            GLOBAL_WORLD.storageManager.loadFromData(ev.data.storage);
            GLOBAL_WORLD.archetypeManager.loadFromData(ev.data.archetypeManager);

            SYSTEM = new SystemClass(GLOBAL_WORLD);

            SYSTEM.setStepSizeAndOffset(ev.data.stepSize, ev.data.offset);

            GLOBAL_WORLD.addSystem(SYSTEM);
            setIdMap(ev.data.components);

            postMessage({
                type: MessageType.init,
                id: SystemClass.id,
                name: SystemClass.name,
            });

            logger.groupEnd();

            startUpdateLoop(ev.data.triggerArray, ev.data.offset);

            logger.logOk(
                "System",
                SystemClass.name,
                "(",
                SystemClass.id,
                ") is ready and waiting for updates"
            );
            break;
        }

        case MessageType.sync: {
            logger.groupCollapsed("Syncing from data dump", ev.data);
            loadCustomComponentStorages(ev.data.customStorages);
            GLOBAL_WORLD.storageManager.loadFromData(ev.data.storage);
            logger.logOk(
                `System`,
                SystemClass.name,
                "(",
                SystemClass.id,
                ")",
                `synced`
            );
            logger.groupCollapsed();
            break;
        }

        case MessageType.newArchetype: {
            const archetype = Object.create(
                Archetype.prototype,
                Object.getOwnPropertyDescriptors(ev.data.archetype)
            );
            GLOBAL_WORLD.queryManager.onNewArchetypeCreated(archetype);
        }

        case MessageType.update: {
            SYSTEM.update();
            this.postMessage({
                type: MessageType.update,
            });
        }
    }
};

async function startUpdateLoop(arrayBuffer: Int32Array, index: number) {
    while (true) {
        // While this is 0 we will not update
        await Atomics.waitAsync(arrayBuffer, index, 0).value;

        SYSTEM.update();

        Atomics.store(arrayBuffer, index, 0);
        Atomics.notify(arrayBuffer, index);
    }
}
