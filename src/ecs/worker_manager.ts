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

const logger = new Logger("worker-manager");
interface WorkerLike {
    postMessage(data: any): void;
}

// A object that represents multiple workers
export class WorkerProxy {
    constructor(public workers: Worker[]) {}

    postMessage(data: any): void {
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
    public readonly workers: WorkerLike[] = [];

    constructor(private readonly world: World) {}

    async loadWorkerSystem(url: string, numThreads: number = 1) {
        let worker: Worker | WorkerProxy;
        let systemData: {
            name: string;
            id: number;
        };

        if (numThreads === 1) {
            logger.log(`Loading remote system...`);

            worker = new Worker(url, { type: "module" });

            worker.postMessage({
                type: MessageType.init,
                storage: this.world.storageManager.storages,
                components: ID_MAP,
                archetypeManager: this.world.archetypeManager,
                resources: this.world.resourceManager.resources,
                customStorages: CUSTOM_COMPONENT_STORAGES,
                stepSize: 1,
                offset: 0,
            });

            systemData = await awaitMessage<{ name: string; id: number }>(
                worker,
                MessageType.init
            );
        } else {
            logger.log(`Loading remote system with ${numThreads} threads`);

            worker = new WorkerProxy(
                new Array(numThreads).map(
                    (_) => new Worker(url, { type: "module" })
                )
            );

            systemData = (
                await worker.emitAndWait<{
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
                )
            )[0];
        }

        this.workers[systemData.id] = worker;
        logger.ok(
            `Remote system ${systemData.name} (${systemData.id}) is ready`
        );

        return systemData.id;
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
