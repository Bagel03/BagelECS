---
sidebar_position: 4
---

Sometimes, it is useful to have global data that is not associated with any specific entity. To handle this, BagelECS supports [bevy](https://bevyengine.org) inspired _resources_. These follow most of the same rules as components, except they are associated with the world instead of entities.

## Add A Resource

`World.prototype.add` will add anything as a resource. Specify a second argument if you want to use a type more than once (Similar to [Entities](./Entities.md#adding-components))

```ts
import {Camera, Ojbect3D} from "three"
const world = new World(100);

world.add(new Camera(..));

world.add(new Object3D(..), "ground");
world.add(new Object3D(..), "skybox");
```

:::caution Notice how all of those things could have been individual entities
For example, a camera entity or a skybox entity. Even if you only will have 1 of whatever "thing" you are representing with a resource, most of the time it is better to add it as an entity, because resources will not show up in queries and will not interact with the rest of the world through systems.
For that reason, most resources will probabbly end up looking something like this:

```ts
world.add(1000 / 60, "framerate");
world.add("Player1", "name");
```

:::

## Remove a resource

Use `World.prototype.remove` to remove a resource from a supplied `intoId`:

```ts
world.remove(Camera);
world.remove("framerate");
```

## Get a resource

Getting resources is very similar to getting [components](./Entities.md#getting-data), just supply an `intoId` and a generic type:

```ts
world.get<number>("framerate");
world.get(Camera);
```
