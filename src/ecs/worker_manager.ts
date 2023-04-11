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

// A object that represents multiple workers
export class WorkerProxy {
    constructor(public workers: Worker[]) {}

    emit(data: any): void {
        for (let i = this.workers.length - 1; i >= 0; i--) {
            this.workers[i].postMessage(data);
        }
    }

    emitAndWait<T>(
        emitData: any,
        waitFor: any,
        indexProp?: string
    ): Promise<T[]> {
        const promises: Promise<any>[] = [];

        for (let i = 0; i < this.workers.length; i++) {
            if (indexProp) {
                this.workers[i].postMessage({ ...emitData, [indexProp]: i });
            } else {
                this.workers[i].postMessage(emitData);
            }

            promises.push(awaitMessage(this.workers[i], waitFor));
        }

        return Promise.all(promises);
    }
}

export class WorkerManager {
    public readonly workers: WorkerProxy[] = [];

    constructor(private readonly world: World) {}

    async loadWorkerSystem(url: string, numThreads: number = 1) {
        Logger.log(`Loading remote system with ${numThreads} threads`);

        const workers: Worker[] = [];

        // const promises: Promise<{name: string, id: number}>[] = [];
        for (let i = 0; i < numThreads; i++) {
            workers.push(new Worker(url, { type: "module" }));
        }

        const proxy = new WorkerProxy(workers);

        const [{ name, id }] = await proxy.emitAndWait<{
            name: string;
            id: number;
        }>(
            {
                type: MessageType.init,
                storage: this.world.storageManager.storages,
                components: ID_MAP,
                archetypeManager: this.world.archetypeManager,
                resources: this.world.resourceManager.resources,
                customStorages: CUSTOM_COMPONENT_STORAGES,
                stepSize: numThreads,
            },
            MessageType.init,
            "offset"
        );

        this.workers[id] = proxy;
        Logger.logOK(`Remote system ${name} (${id}) is ready`);

        return id;
    }

    async update(id: number) {
        this.workers[id].emit({ type: MessageType.update });
    }

    updateAll() {
        this.workers.forEach((worker) => {
            worker.emit({ type: MessageType.update });
        });
    }

    onNewArchetypeCreated(archetype: Archetype) {
        for (const worker of this.workers) {
            worker.emit({
                type: MessageType.newArchetype,
                archetype,
            });
        }
    }
}
