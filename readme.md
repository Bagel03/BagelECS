# BagelECS

BagelECS is my attempt to create a typescript ECS implementation that is both performance oriented and human friendly.

## Features:

-   **🔥 Fast**: Using typed arrays and other performance optimizations, users should see speeds similar to the fastest web implementations, including [bitecs](https://github.com/NateTheGreatt/bitECS) and [wolfecs](https://github.com/EnderShadow8/wolf-ecs).
-   📊 **Multithreaded**: Get even more speed out of your app without any major refactoring, with a simple API to run multiple systems concurrently
-   🎯 **Type Safe**: All code is written in typescript, giving you full autocomplete and type checking, in spots that other libraries might struggle.
-   📖 **Human Readable**: BagelECS was written because many of the previously mentioned performance based ECS's were a pain to read and write. BagelECS's API aims to mirror the way your brain sees your world.
-   🧪 **No Limits:** BagelECS has very few restrictions on when and where you can do what. No need to setup lots of boilerplate, or define all your components beforehand. Do what you want when you want to.

## Install

```
npm i bagelecs
```

## Docs
Check out the docs [here](https://bagel03.github.io/BagelECS/) for general guides and the API reference.

## Quick start

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
