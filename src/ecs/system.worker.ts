import {
    ComponentStorage,
    StorageManager,
    loadCustomComponentStorages,
} from "./storage.js";
import { System } from "./system.js";
import { MessageType } from "./worker_manager.js";
import { World } from "./world.js";
import "./entity.js";
import { QueryManager } from "./query.js";
import { Logger } from "../utils/logger.js";
import { Archetype } from "./archetype.js";
import { setIdMap } from "./component.js";
import { Class } from "../utils/types.js";

Logger.log("Worker thread created");

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

let SYSTEM: System<any>;
let SystemClass: Class<System<any>>;

export function registerRemoteSystem(system: Class<System<any>>) {
    SystemClass = system;
}

onmessage = async function workerSystemOnMessage(ev) {
    switch (ev.data.type) {
        case MessageType.init: {
            Logger.log("Remote thread: Loading modules..");

            loadCustomComponentStorages(ev.data.customStorages);
            GLOBAL_WORLD.storageManager.loadFromData(ev.data.storage);
            GLOBAL_WORLD.archetypeManager.loadFromData(
                ev.data.archetypeManager
            );
            GLOBAL_WORLD.resourceManager.loadFromData(ev.data.resources);

            SYSTEM = new SystemClass(GLOBAL_WORLD);

            GLOBAL_WORLD.addSystem(SYSTEM);
            setIdMap(ev.data.components);

            postMessage({ type: MessageType.init });
            break;
        }

        case MessageType.sync: {
            loadCustomComponentStorages(ev.data.customStorages);
            GLOBAL_WORLD.storageManager.loadFromData(ev.data.storage);
            GLOBAL_WORLD.resourceManager.loadFromData(ev.data.resources);

            Logger.logOK(`Remote system ${SYSTEM.constructor.name} Synced`);
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
        }
    }
};
