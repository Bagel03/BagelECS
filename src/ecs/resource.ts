import { Class } from "../utils/types";
import { TypeId } from "./component";
import { intoID } from "./entity";
import { World } from "./world";

export class ResourceManager {
    public readonly resources: Map<number, any> = new Map();

    constructor(public readonly world: World) {}

    addResource(resource: any, id: number = resource.constructor.getId()) {
        this.resources.set(id, resource);
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
        //@ts-ignore
        this.resources = data;
    }
}
