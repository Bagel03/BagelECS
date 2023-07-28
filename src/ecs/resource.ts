import { Logger } from "../utils/logger";
import { Class } from "../utils/types";
import { TypeId } from "./component";
import { intoID } from "./entity";
import { World } from "./world";

const logger = new Logger("World", "Resources");
export class ResourceManager {
    public readonly resources: Map<number, any> = new Map();

    constructor(public readonly world: World) {}

    addResource(resource: any, id: intoID = resource.constructor.getId()) {
        if (typeof id !== "number") id = id.getId();

        this.resources.set(id, resource);
        logger.log("Added resource", resource, "(Id:", id, ")");
    }

    removeResource(id: intoID) {
        if (typeof id !== "number") id = id.getId();
        this.resources.delete(id as number);
    }

    getResource<T>(resource: Class<T>): T;
    getResource<T>(id: intoID | TypeId<T>): T;

    getResource<T>(id: intoID | TypeId<T>): T {
        return this.resources.get(typeof id == "number" ? id : id.getId());
    }

    /** @internal */
    public loadFromData(data: any) {
        logger.log("Loading from data dump:", data);

        //@ts-ignore
        this.resources = data;
    }
}
