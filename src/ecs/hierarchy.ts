import { Component, Type } from "./component.js";
import { Entity } from "./entity.js";

const Hierarchy = Component({
    firstChild: Type.nullable(Type.entity),
    nextSibling: Type.nullable(Type.entity),
    parent: Type.nullable(Type.entity),
});

declare module "./entity.js" {
    export interface EntityAPI {
        addChild(entity: Entity): void;
        removeChild(entity: Entity): void;
        children(): IterableIterator<Entity>;
    }
}

//@ts-expect-error
Number.prototype.addChild = function (this: Entity, entity: Entity): void {
    let myHierarchy = this.get(Hierarchy);

    if (!myHierarchy) {
        myHierarchy = new Hierarchy({
            firstChild: null,
            nextSibling: null,
            parent: null,
        });
        this.add(myHierarchy);
    }

    let oldFirstChild = this.get(Hierarchy.firstChild);
    this.update(Hierarchy.firstChild, entity);

    if (entity.has(Hierarchy)) {
        // TODO;
    } else {
        entity.add(
            new Hierarchy({
                parent: this,
                firstChild: null,
                nextSibling: oldFirstChild,
            })
        );
    }
};

//@ts-ignore
Number.prototype.removeChild = function (this: Entity, entity: Entity) {
    if (this.get(Hierarchy.firstChild) == entity) {
        this.update(Hierarchy.firstChild, entity.get(Hierarchy.nextSibling));
        return;
    }

    let lastChild = this.get(Hierarchy.firstChild)!;
    let child = lastChild.get(Hierarchy.nextSibling);
    while (child) {
        if (child == entity) {
            lastChild.update(
                Hierarchy.nextSibling,
                child.get(Hierarchy.nextSibling)
            );
            break;
        }
    }
};

//@ts-expect-error
Number.prototype.children = function* (this: Entity) {
    if (!this.has(Hierarchy) || this.get(Hierarchy.firstChild) === null) return;

    let child = this.get(Hierarchy.firstChild)!;
    yield child;

    while ((child = child.get(Hierarchy.nextSibling)!)) {
        yield child;
    }
};
