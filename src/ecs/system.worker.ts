import {
    ComponentStorage,
    StorageManager,
    loadCustomComponentStorages,
} from "./storage";
import { InternalSystem } from "./system";
import { MessageType } from "./worker_manager";
import { World } from "./world";
import "./entity";
import { QueryManager } from "./query";
import { Logger } from "../utils/logger";
import { Archetype } from "./archetype";
import { setIdMap } from "./component";
import { Class } from "../utils/types";

const logger = new Logger("Worker Thread");
logger.log("Worker thread created");

// Init world stuff
const GLOBAL_WORLD = new World(0);

// Init entity /component stuff (Disable stuff)
{
    //@ts-expect-error
    Number.prototype.add = function (
        component: any,
        id: number = component.getId()
    ) {
        console.warn(
            "Components can not be added or removed by worker systems"
        );
    };

    //@ts-expect-error
    Number.prototype.delete = function (id: number) {
        console.warn(
            "Components can not be added or removed by worker systems"
        );
    };

    StorageManager.prototype.getStorage = function (id: number) {
        if (this.storages[id]) return this.storages[id];
        // This should never happen, as new components couldn't be added in the first place
        throw new Error("Can not create new storage type inside of workers");
    };
}

let SYSTEM: InternalSystem<any>;
let SystemClass: Class<InternalSystem<any>> & { id: number };

export function registerRemoteSystem(
    system: Class<InternalSystem<any>> & { id: number }
) {
    SystemClass = system;
}

onmessage = async function workerSystemOnMessage(ev) {
    switch (ev.data.type) {
        case MessageType.init: {
            logger.log("Remote thread: Loading modules..");

            loadCustomComponentStorages(ev.data.customStorages);
            GLOBAL_WORLD.storageManager.loadFromData(ev.data.storage);
            GLOBAL_WORLD.archetypeManager.loadFromData(
                ev.data.archetypeManager
            );
            GLOBAL_WORLD.resourceManager.loadFromData(ev.data.resources);

            SYSTEM = new SystemClass(GLOBAL_WORLD);

            SYSTEM.setStepSizeAndOffset(ev.data.stepSize, ev.data.offset);

            GLOBAL_WORLD.addSystem(SYSTEM);
            setIdMap(ev.data.components);

            postMessage({
                type: MessageType.init,
                id: SystemClass.id,
                name: SystemClass.name,
            });
            break;
        }

        case MessageType.sync: {
            loadCustomComponentStorages(ev.data.customStorages);
            GLOBAL_WORLD.storageManager.loadFromData(ev.data.storage);
            GLOBAL_WORLD.resourceManager.loadFromData(ev.data.resources);

            logger.info(`Remote system ${SYSTEM.constructor.name} Synced`);
            break;
        }

        case MessageType.newArchetype: {
            const archetype = Object.create(
                Archetype.prototype,
                Object.getOwnPropertyDescriptors(ev.data.archetype)
            );
            console.log("Generated new archetype");
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
