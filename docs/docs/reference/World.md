---
sidebar_position: 1
---

# World

Everything in BagelECS is contained in a `World`, including [entities](./Entities.md), [resources](./Resources.md), and [systems](./Systems.md). More detailed documentation for each is available on their respective pages, this section is just a high level overview of a world.

## Creating a World

Just create a `new World` object, and supply the maximum number of entities it can store (this can be changed later).

```ts
const world = new World(100);
```

### The Global World

BagelECS automatically stores the world you created in the `World.GLOBAL_WORLD` static property. This is useful if you don't want to worry about passing you world around, and it allows all the entity APIs to be cleaner.
However, this means that you can **not** create more than one world. The second world will override the first, and any new entity calls (`.add()`, `.get()`) will try to access the second world. This could lead to lots of crashes or uncontrolled behavior, so make sure all your apps only construct a world once (at a time)

## Expanding and Shrinking the World

When you create a world, you have to pass a `maxEntities` argument that tells BagelECS how much memory to allocate for your entities and components. If you try to surpass this things will break, and at this point BagelECS has very few runtime checks in place so debugging will be difficult. If you need to expand the entity cap, set the `maxEntities` property of your world:

```ts
world.maxEntities = 2000;
```

This will automatically resize all storages and sync the changes with any remote systems.
