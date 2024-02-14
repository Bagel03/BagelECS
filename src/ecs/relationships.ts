import type { Entity, intoID } from "./entity";
import { getBits } from "../utils/bits";
import { QueryModifierFactory, With } from "./query";
import { TypeId } from "./types";

declare module "./entity" {
    interface EntityAPI {
        relate(by: intoID, to: Entity, data?: any): void;
        getAllRelatedBy(relationship: intoID): Set<Entity>;
        getSingleRelatedBy(relationship: intoID): Entity | null;
    }
}

export const RELATIONSHIP_SHIFT = 15;
export function Relationship<T = any>(name: intoID, entity: Entity): TypeId<T> {
    if (typeof name !== "number") {
        name = name.getId();
    }

    return (((name as number) << RELATIONSHIP_SHIFT) | entity) as TypeId<T>;
}

export const loadRelationshipMethods = (extraMethods: any[]) =>
    extraMethods.push(() => {
        //@ts-expect-error
        Number.prototype.relate = function (
            this: Entity,
            by: intoID,
            to: Entity,
            data?: any
        ) {
            if (data == undefined) {
                this.tag(Relationship(by, to));
            } else {
                this.add(Relationship(by, to), data);
            }
        };

        //@ts-expect-error
        Number.prototype.getAllRelatedBy = function (this: Entity, by: intoID) {
            if (typeof by !== "number") {
                by = by.getId();
            }

            return this.components()
                .filter((component) => component >> RELATIONSHIP_SHIFT == by)
                .map((component) => getBits(component, 0, RELATIONSHIP_SHIFT));
        };

        //@ts-expect-error
        Number.prototype.getSingleRelatedBy = function (this: Entity, by: intoID) {
            if (typeof by !== "number") {
                by = by.getId();
            }
            for (const component of this.components()) {
                if (component >> RELATIONSHIP_SHIFT == by)
                    return getBits(component, 0, RELATIONSHIP_SHIFT);
            }

            return null;
        };
    });

export const WithRelationship: QueryModifierFactory<
    [relationship: number] | [relationship: number, to: Entity]
> = (relationship, to?) =>
    typeof to === "number"
        ? With(Relationship(relationship, to))
        : (components) =>
              components.some(
                  (component) => component >> RELATIONSHIP_SHIFT == relationship
              );
