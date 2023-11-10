import { Class } from "../utils/types";
import { Entity, intoID, loadEntityMethods } from "./entity";
import "../utils/setFns";
import { QueryManager, QueryModifier } from "./query";
import { StorageManager } from "./storage";
import { BagelSystem, SystemOrdering } from "./system";
import { SystemManager } from "./system_manager";
import { WorkerManager } from "./worker_manager";
import { ArchetypeManager } from "./archetype";
import { ResourceManager } from "./resource";
import { Logger } from "../utils/logger";
import "./relationships";
import "./hierarchy";
import { TypeId } from "./types";
import { EntityComponent, Resource } from "./component";

const logger = new Logger("World");

export class World {
    public static readonly GLOBAL_WORLD: World;

    public readonly entities: Int32Array;

    public readonly storageManager: StorageManager;
    public readonly queryManager: QueryManager;
    public readonly workerManager: WorkerManager;
    public readonly systemManager: SystemManager;
    public readonly archetypeManager: ArchetypeManager;
    public readonly resourceManager: ResourceManager;

    private readonly reservedEntity = 0 as Entity;

    constructor(private internalMaxEntities: number) {
        logger.group("Creating world with", internalMaxEntities, "entities");

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

        logger.groupEnd();
        logger.logOk(
            "Created world with max capacity of",
            internalMaxEntities,
            "entities"
        );
    }

    get maxEntities() {
        return this.internalMaxEntities;
    }

    set maxEntities(v: number) {
        this.internalMaxEntities = v;

        logger.log("Resizing all storages for", v, "entities...");
        this.archetypeManager.resize(v);
        this.storageManager.resize(v);
    }

    private openEntIds: number[] = [];
    private nextEntId: number = 1;

    spawn(...components: (any | [any, number])[]): Entity {
        const ent = (this.openEntIds.pop() ?? this.nextEntId++) as Entity;
        this.entities[this.entities[0]] = ent;
        this.entities[0]++;

        for (const component of components) {
            if (Array.isArray(component)) {
                ent.add(component[0], component[1]);
            } else {
                ent.add(component);
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

    addSystem(
        system: Class<BagelSystem<any>> | BagelSystem<any>,
        schedule: string | false = "DEFAULT",
        enable: boolean = true,
        ordering?: SystemOrdering
    ) {
        if (!(system instanceof BagelSystem)) system = new system(this);
        const sys = system.constructor as typeof BagelSystem;

        ordering ??= sys.runOrder;

        this.systemManager.addSystem(system);
        system.init();

        if (schedule === false) {
            return this;
        }

        this.systemManager.addToSchedule(
            sys.id,
            schedule as string,
            ordering,
            enable
        );
        return this;
    }

    async addRemoteSystem(url: string, numThreads?: number) {
        const id = await this.workerManager.loadWorkerSystem(url, numThreads);
        this.systemManager.addRemoteSystem(id);
        return this;
    }

    createSchedule(name: string, ...systems: Class<BagelSystem<any>>[]) {
        this.systemManager.createSchedule(
            name,
            ...systems.map((sys) => (sys as typeof BagelSystem).id)
        );

        return this;
    }

    addToSchedule(
        system: Class<BagelSystem<any>>,
        schedule: string = "DEFAULT",
        ordering?: SystemOrdering,
        enabled = true
    ) {
        this.systemManager.addToSchedule(
            (system as typeof BagelSystem).id,
            schedule,
            ordering ?? (system as typeof BagelSystem).runOrder,
            enabled
        );
        return this;
    }

    enable(system: Class<BagelSystem<any>>, schedule = "DEFAULT") {
        this.systemManager.enable((system as typeof BagelSystem).id, schedule);
        return this;
    }

    disable(system: Class<BagelSystem<any>>, schedule = "DEFAULT") {
        this.systemManager.disable((system as typeof BagelSystem).id, schedule);
    }

    tick(schedule: string = "DEFAULT"): Promise<void> {
        this.storageManager.update();
        return this.update(schedule);
    }

    update(systems: Class<BagelSystem<any>>[]): Promise<void>;
    update(schedule?: string): Promise<void>;
    update(arg: string | Class<BagelSystem<any>>[] = "DEFAULT"): Promise<void> {
        if (typeof arg === "string") {
            return this.systemManager.update(arg);
        }

        for (let i = arg.length - 1; i >= 0; i--) {
            if (typeof arg[i] !== "number") {
                //@ts-ignore
                arg[i] = (arg[i] as typeof BagelSystem).id;
            }
        }

        return this.systemManager.update(arg as any);
    }

    // Resources (Meant to mimic the entity / component API)
    // Under the hood, it uses the same storage system, but without the archetype stuff
    add(resource: any, id: intoID = resource.constructor.getId()) {
        if (resource instanceof EntityComponent) {
            resource.copyIntoStorage(this, this.reservedEntity);
            return;
        }

        if (typeof id !== "number") {
            id = id.getId();
        }

        World.GLOBAL_WORLD.storageManager
            .getOrCreateStorage(id, resource.storageKind)
            .addOrSetEnt(this.reservedEntity, resource);
    }

    get = this.reservedEntity.get.bind(this.reservedEntity);
    set = this.reservedEntity.set.bind(this.reservedEntity);

    remove(id: intoID) {
        if (typeof id !== "number") id = id.getId();

        this.storageManager.storages[id].deleteEnt(this.reservedEntity);
    }
}
