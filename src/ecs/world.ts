import { Class } from "../utils/types";
import { Entity, intoID } from "./entity";
import "./entity";
import "../utils/setFns";
import { QueryManager, QueryModifier } from "./query";
import { StorageManager } from "./storage";
import { InternalSystem } from "./system";
import { SystemManager } from "./system_manager";
import { WorkerManager } from "./worker_manager";
import { ArchetypeManager } from "./archetype";
import { ResourceManager } from "./resource";
import { Logger } from "../utils/logger";

export class World {
    public static readonly GLOBAL_WORLD: World;
    private static nextComponentId = 0;
    public static getUniqueComponentId = () => this.nextComponentId++;

    public readonly entities: Int32Array;

    /** @internal */
    public readonly storageManager: StorageManager;
    /** @internal */
    public readonly queryManager: QueryManager;
    /** @internal */
    public readonly workerManager: WorkerManager;
    /** @internal */
    public readonly systemManager: SystemManager;
    /** @internal */
    public readonly archetypeManager: ArchetypeManager;
    /** @internal */
    public readonly resourceManager: ResourceManager;

    constructor(private internalMaxEntities: number) {
        this.storageManager = new StorageManager(this);
        this.queryManager = new QueryManager(this);
        this.workerManager = new WorkerManager(this);
        this.systemManager = new SystemManager(this);
        this.archetypeManager = new ArchetypeManager(this);
        this.resourceManager = new ResourceManager(this);

        this.entities = new Int32Array(
            new SharedArrayBuffer(
                Int32Array.BYTES_PER_ELEMENT * (internalMaxEntities + 1)
            )
        );

        //@ts-ignore
        World.GLOBAL_WORLD = this;
    }

    get maxEntities() {
        return this.internalMaxEntities;
    }

    set maxEntities(v: number) {
        this.internalMaxEntities = v;

        Logger.log("Resizing all storages to" + v);
        this.archetypeManager.resize(v);
        this.storageManager.resize(v);
    }

    private openEntIds: number[] = [];
    private nextEntId: number = 0;

    spawn(...components: (any | [any, number])[]): Entity {
        const ent = (this.openEntIds.pop() ?? this.nextEntId++) as Entity;
        this.entities[this.entities[0]] = ent;
        this.entities[0]++;

        for (const component of components) {
            if (Array.isArray(component)) {
                ent.add(component[0], component[1]);
            } else {
                ent.add(component[0]);
            }
        }

        return ent;
    }

    destroy(ent: Entity) {
        this.openEntIds.push(ent);
        this.archetypeManager.archetypes
            .get(this.archetypeManager.entityArchetypes[ent])!
            .removeEntity(ent);
    }

    query(...modifiers: QueryModifier[]) {
        return this.queryManager.query(...modifiers);
    }

    addSystem(system: Class<InternalSystem<any>> | InternalSystem<any>) {
        if (!(system instanceof InternalSystem)) system = new system(this);

        this.systemManager.addSystem(system);
    }

    async addRemoteSystem(url: string) {
        const id = await this.workerManager.loadWorkerSystem(url);
        this.systemManager.addRemoteSystem(id);
    }

    enable(system: Class<InternalSystem<any>>) {
        this.systemManager.enableSystem((system as any).id);
    }

    disable(system: Class<InternalSystem<any>>) {
        this.systemManager.disable((system as any).id);
    }

    update(...systems: Class<InternalSystem<any>>[]) {
        this.systemManager.update(
            ...systems.map((system: any) => system.id as number)
        );
    }
}