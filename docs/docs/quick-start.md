---
title: "Quick Start"
sidebar_position: 2
---

This is a sample project that doesn't actually run, but should give you a feel for all the different APIs that BagelECS provides

```ts
// Use an external class as a component
import { Object3D } from "three";

// Define a "fast" - builtin component
const Vec = Component(
    {
        x: Type.number,
        y: Type.number,
    },
    {
        // Add some useful methods as you would to any other class
        add(x: number, y: number): void {
            this.x += x;
            this.y += y;
        },
    }
);

// Create a system that only needs one kind of entity
class MovementSys extends CustomSystem(Vec) {
    update(): void {
        this.entities.forEach((ent) => Vec.add(ent, 1, 1));
    }
}

// Create a system that needs more than one kind of entity
class FullMovementSys extends CustomSystem({ threeD: Object3D, twoD: Vec }) {
    update(): void {
        this.entities.twoD.forEach((ent) => Vec.add(ent, 1, 1));
        this.entities.threeD.forEach((ent) => {
            ent.get(Object3D).position.x += 1;
            ent.get(Object3D).position.y += 1;
        });
    }
}

// A world holds all entities
const world = new World(100);

// Systems can be added to worlds and run on the world's "update" method
world.addSystem(FullMovementSys);

// Get a new entity
const ent = world.spawn();

// Add some stuff to it
ent.add(new Vec({ x: 1, y: 1 }));

// Run all the systems on their targeted entities
world.update();

// Check the entities new position
console.log(ent.get(Vec.x), ent.get(Vec.y));
```
