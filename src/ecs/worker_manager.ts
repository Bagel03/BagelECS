import { Logger } from "../utils/logger";
import { Archetype } from "./archetype";
import { ID_MAP } from "./component";
import { CUSTOM_COMPONENT_STORAGES } from "./custom_storages";
import { World } from "./world";
import { awaitMessage } from "../utils/await_worker";

export enum MessageType {
    init,
    update,
    sync,
    newArchetype,
}

const logger = new Logger("Worker Manager");
interface WorkerLike {
    postMessage(data: any): void;
}

// A object that represents multiple workers
export class WorkerProxy {
    public workers: Worker[] = [];

    constructor(public url: string, public numThreads: number) {}

    postMessage(data: any): void {
        for (let i = this.workers.length - 1; i >= 0; i--) {
            this.workers[i].postMessage(data);
        }
    }

    async initAndEmitData<T>(
        emitData: any,
        waitFor: any,
        indexProp?: string
    ): Promise<T[]> {
        const data = [];

        for (let i = 0; i < this.numThreads; i++) {
            this.workers.push(new Worker(this.url, { type: "module" }));

            if (indexProp) {
                this.workers[i].postMessage({ ...emitData, [indexProp]: i });
            } else {
                this.workers[i].postMessage(emitData);
            }
            data[i] = await awaitMessage(this.workers[i], waitFor);
        }

        return data;
    }
}

export class WorkerManager {
    public readonly workers: WorkerLike[] = [];
    private readonly triggerArrays: Int32Array[] = [];

    constructor(private readonly world: World) {}

    async loadWorkerSystem(url: string): Promise<number>;
    async loadWorkerSystem(
        url: string,
        numThreads?: number,
        startInOrder?: boolean
    ): Promise<number>;

    async loadWorkerSystem(url: string, numThreads: number = 1) {
        let worker: Worker | WorkerProxy;
        let systemData: {
            name: string;
            id: number;
        };

        const triggerArray = new Int32Array(
            new SharedArrayBuffer(numThreads * Int32Array.BYTES_PER_ELEMENT)
        );

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
                triggerArray,
            });

            systemData = await awaitMessage<{ name: string; id: number }>(
                worker,
                MessageType.init
            );
        } else {
            logger.log(`Loading remote system with ${numThreads} threads`);

            worker = new WorkerProxy(url, numThreads);

            systemData = (
                await worker.initAndEmitData<{
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
                        triggerArray,
                    },
                    MessageType.init,
                    "offset"
                )
            )[0];
        }

        this.workers[systemData.id] = worker;
        this.triggerArrays[systemData.id] = triggerArray;
        logger.logOk(
            `Remote system ${systemData.name} (${systemData.id}) is ready`
        );

        return systemData.id;
    }

    update(id: number): Promise<any> {
        const triggerArray = this.triggerArrays[id];
        if (triggerArray.length === 1) {
            // Tell them to go
            Atomics.store(triggerArray, 0, 1);
            Atomics.notify(triggerArray, 0);

            // Wait for it to respond
            return Atomics.waitAsync(triggerArray, 0, 1).value as Promise<any>;
        }

        const promises = [];
        for (let i = triggerArray.length - 1; i >= 0; i--) {
            Atomics.store(triggerArray, i, 1);
            Atomics.notify(triggerArray, i);
            promises.push(Atomics.waitAsync(triggerArray, i, 1).value);
        }

        return Promise.all(promises);
    }

    updateAll() {
        this.triggerArrays.forEach((arr, idx) => this.update(idx));
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
