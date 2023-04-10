import { Logger } from "../utils/logger";
import type { Tree } from "../utils/types";
import { Archetype } from "./archetype";
import { ID_MAP } from "./component";
import { Query } from "./query";
import { CUSTOM_COMPONENT_STORAGES } from "./storage";
import { System, InternalSystem } from "./system";
import { World } from "./world";
import { awaitMessage } from "../utils/await_worker";

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
        Logger.log(`Loading remote system`);
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

        // const {name, id} = await new Promise<{
        //     name: string,
        //     id: number
        // }>((res, rej) => {
        //     worker.onmessage = (ev) => {
        //         if (ev.data.type == MessageType.init) res(ev.data);
        //     };
        // });

        const { name, id } = await awaitMessage<{ name: string; id: number }>(
            worker,
            MessageType.init
        );
        this.workers[id] = worker;
        Logger.logOK(`Remote system ${name} (${id}) is ready`);

        return id;
    }

    async update(id: number) {
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
