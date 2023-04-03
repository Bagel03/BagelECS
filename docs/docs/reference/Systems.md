---
sidebar_position: 6
---

Systems define how your entities interact with each other in the world, and use queries to modify specific entities' properties

## Create a System

To create a system, use the `System` function to create a class and extend it to add your own methods:

```ts
class MyCustomSys extends System({}) {}
```

### Queries

As mentioned in the [queries](./Queries.md#within-systems) page, the `System()` function takes a single argument: A `Tree` of query modifiers (or modifier [shorthand](./Queries.md#modifiers)).
These then create a matching tree of queries that can be accessed inside the system's `entities` property:

```ts
class MyCustomSys extends System(With(ComponentA)) {
    update() {
        this.entities.forEach((ent) => console.log(ent.get(ComponentA)));
    }
}
```

## Add a system to the world

To add a system to the world, you pass either the extended class or an instance to `World.prototype.addSystem()`:

```ts
world.addSystem(new MyCustomSys());

// Can also use
world.addSystem(MyCustomSys);
```

This will also enable the system by default.

## Enable a system:

To enable a system (call its `update()` method anytime the world is updated), use `World.prototype.enable` and pass in the class:

```ts
world.enable(MyCustomSys);
```

## Disable a system:

There is no reason for a system to be fully removed from the world, but you can disable it from updating with the rest of the world using `World.prototype.disable`:

```ts
world.disable(MyCustomSys);
```

## Update systems

`World.prototype.update()` is used to update the world, and can optionally take an array of System classes to update. If none are passed, all currently enabled systems are updated:

```ts
// Update all enabled systems
world.update();

// Update specific systems
world.update(MyCustomSysA, MyCustomSysB);
```

:::caution
When explicitly stating which systems to update, BagelECS doesn't check if a system is enabled or disabled. This means that if you are using your own enable/disable logic, and explicitly stating which systems to run, you could accidentally run a system after disabling it.
:::
