import { Tree } from "../utils/types.js";
import { Query } from "./query.js";
import { System } from "./system.js";
import { World } from "./world.js";

enum SystemType {
    LOCAL,
    REMOTE,
}

export class SystemManager {
    public localSystems: System<any>[] = [];
    public systemLocations: SystemType[] = [];
    public enabled = new Set<number>();

    constructor(private readonly world: World) {}

    registerSystem(id: number, type: SystemType = SystemType.REMOTE) {
        this.systemLocations[id] = type;
        this.enabled.add(id);
    }

    enableSystem(id: number) {
        this.enabled.add(id);
    }

    disable(id: number) {
        this.enabled.delete(id);
    }

    addSystem(system: System<any>) {
        //@ts-expect-error
        const { id } = system.constructor;
        this.localSystems[id] = system;
        this.registerSystem(id, SystemType.LOCAL);

        // Register system queries
        const registerQueryTree = (queries: Tree<Query>) => {
            if (queries instanceof Query) {
                this.world.queryManager.addQuery(queries);
                return;
            }

            for (const query of Object.values(queries)) {
                registerQueryTree(query);
            }
        };

        registerQueryTree(system.entities);
    }

    addRemoteSystem(id: number) {
        this.registerSystem(id, SystemType.REMOTE);
    }

    update(...systems: number[]) {
        //@ts-ignore
        if (systems.length == 0) systems = this.enabled;

        for (const systemId of systems) {
            if (this.systemLocations[systemId] == SystemType.REMOTE) {
                this.world.workerManager.update(systemId);
            } else {
                this.localSystems[systemId].update();
            }
        }
    }
}
