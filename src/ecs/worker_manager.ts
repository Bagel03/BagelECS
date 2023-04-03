import { Logger } from "../utils/logger.js";
import type { Tree } from "../utils/types.js";
import { Archetype } from "./archetype.js";
import { ID_MAP } from "./component.js";
import { Query } from "./query.js";
import { CUSTOM_COMPONENT_STORAGES } from "./storage.js";
import { CustomSystem, System } from "./system.js";
import { World } from "./world.js";

export enum MessageType {
    init,
    update,
    sync,
    newArchetype,
}

export class WorkerManager {
    public readonly workers: Worker[] = [];

    constructor(private readonly world: World) {}

    async loadWorkerSystem(url: string) {
        const {
            default: system,
        }: { default: ReturnType<typeof CustomSystem> } = await import(url);

        Logger.log(`Loading remote system ${system.name} (id: ${system.id})`);
        const worker = new Worker(url, {
            type: "module",
        });

        worker.postMessage({
            type: MessageType.init,
            storage: this.world.storageManager.storages,
            components: ID_MAP,
            archetypeManager: this.world.archetypeManager,
            resources: this.world.resourceManager.resources,
            customStorages: CUSTOM_COMPONENT_STORAGES,
        });

        await new Promise<void>((res, rej) => {
            worker.onmessage = (ev) => {
                if (ev.data.type == MessageType.init) res();
            };
        });

        this.workers[system.id] = worker;
        Logger.logOK(`Remote system ${system.name} (${system.id}) is ready`);

        return system.id;
    }

    update(id: number) {
        this.workers[id].postMessage({ type: MessageType.update });
    }

    updateAll() {
        this.workers.forEach((worker) => {
            worker.postMessage({ type: MessageType.update });
        });
    }

    onNewArchetypeCreated(archetype: Archetype) {
        for (const worker of this.workers) {
            worker.postMessage({
                type: MessageType.newArchetype,
                archetype,
            });
        }
    }
}
