import { TypeId } from "./component";
import { Entity, intoID } from "./entity";

declare module "./entity" {
    interface EntityAPI {
        relate(by: intoID, to: Entity, data?: any): void;
        getAllRelatedBy(relationship: intoID): Entity[];
    }
}

export function relationship<T = any>(name: intoID, entity: Entity): TypeId<T> {
    if (typeof name !== "number") name = name.getId();

    return (((name as number) << 32) & entity) as TypeId<T>;
}

//@ts-expect-error
Number.prototype.relate = function (
    this: Entity,
    by: intoID,
    to: Entity,
    data?: any
) {
    if (data == undefined) {
        this.tag(relationship(by, to));
    } else {
        this.add(relationship(by, to), data);
    }
};
