---
sidebar_position: 7
---

BagelECS provides a simple way to add multithreading to your application through JS [worker threads](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). Most things should be seamless, but there are a few important limitations that you should know about.

## System Multithreading

System multithreading refers to running a whole system on its own thread. It's queries will still be based on the main thread, but the logic will not interrupt anything on it's origin thread. Telling BagelECS to run a system on its own thread takes 2 steps:

-   First, create your system in a separate file, and register it as a remote system:

    ```ts title="system.ts"
    import { System } from "bagelecs";
    import { registerRemoteSystem } from "bagelecs/remote";

    import { Pos } from "./components/position";

    export class MySystem extends System(Pos) {
        update() {
            // Move all entities to the right
            this.entities.forEach((ent) =>
                ent.update(Pos.x, ent.get(Pos.x) + 1)
            );
        }
    }

    // Use this:
    registerRemoteSystem(MySystem);
    ```

    :::caution
    Notice that `registerRemoteSystem` is imported from `bagelecs/remote`, not from the base `bagelecs` pacakge.
    :::

-   Now use `World.prototype.addRemoteSystem` and pass in the path to your system file:

    ```ts title="main.ts"
    const world = new World(100);

    world.addRemoteSystem("./system.ts");
    ```

    :::caution
    Make sure that the server you are using can give bagelecs a full path to your system file. This is the source of almost all issues with starting a remote system,
    as in many environments bagelecs will look for `./system.ts` inside of `node_modules/bagelecs`, which will of course fail.
    :::
    You should see a message in the console verifying that your system is working.

## Updating

Remote systems are updated just like any other system, either all at once `world.update()` or by passing the system into the `update()` method:

```ts
import { MySystem } from "./system";

world.update(MySystem);
```

## SIMD Multithreading

SIMD (_single instruction multiple data_) refers to running ths same instruction (function) over lots of data (in an ECS's case different entities and their components).
This would mean running a single system in multiple threads, and evenly distributing the system's targeted entities among the threads. **Currently, BagelECS does not support running the same system in multiple threads**, however it is being investigated.

## Limitations

Due to the nature of worker threads, there are quite a few things that bagelECS can not (realistically) do, including:

### Resources

[Resources](./Resources.md) are not automatically synced between threads. This is because diffing all of your resources every frame would be too expensive and would most likely be slower than having no multithreading at all.

### `Any` Component Types

Similar to resources, any component property that is of type `Type.any` is not automatically synced. [External components](./Components.md#external-components) (Not made with `Component()`), as well as `Type.string` are also not synced.

### Adding and Removing Entities and Components

Currently, worker systems can only edit data that already exists. BagelECS does not allow adding or removing entities from a world, or adding or removing components from an entity.
