---
sidebar_position: 5
---

Quieres represent sets of [entities](Entities.md) that fit some defined criteria. They are most often used within systems, but you can create one-time queries just as easily.

## Modifiers

You very rarely have to manually create a system, instead most API's take 1 or more `QueryModifiers`, functions that have the signature:

```ts
type QueryModifier = (components: Set<number>) => boolean;
```

Where `components` is a set of all the component ID's that belong to the entity. For an entity to be part of a query, it must pass whatever modifier is defined for that query.

### Built-in Modifiers

For your convenince, BagelECS comes with a few built in query modifier factories

-   `With(...components: number[])`: Returns true if an entity contains _every_ supplied component
-   `Without(...components: number[])`: Returns true if an entity has _none_ of the supplied
-   `All(...modifiers: QueryModifier[])`: Returns true if an entity passes all of the supplied

## Within Systems

The `System()` function takes one argument, a tree of query modifiers. These will be associated with returned system class's `entities` property.

```ts
class SysA extends System(With(ComponentA.getId())) {
    update() {
        // Points to a query for all entities with ComponentA
        this.entities;
    }
}

class SysBAndC extends System({b: With(ComponentB.getId()), c: With(ComponentC.getId())) {
    update() {
        // Now this.entities is not a valid query, but an object that contains 2 queries:
        this.entities instanceof Query; // ❌ False

        this.entities.b instanceof Query; // ✅ True
        this.entities.c instanceof Query; // ✅ True
    }
}
```

:::tip
BagelECS also provides a shorthand for specifying query modifiers, which are as follows:

Any `intoId` will be converted to `With(argId)`, so you can leave out the `With()` and `.getId()`

```ts
class SysD extends System(ComponentD) {}
class SysFAndG extends System({ f: ComponentF, g: ComponentG }) {}
```

Any array will be converted to `All()`:

```ts
class SysH extends System([
    With(ComponentH_a.getId()),
    With(componentH_b.getId()),
]) {}
```

All shorthand is recusive, so the previous example can be written without the `With()` (It will be inferred by the first rule):

```ts
class SysH extends System([ComponentH_a, ComponentH_b]) {}
```

Note that while these are nice while writing code, they are slightly more difficult to understand and read, so it could still be better to formally express your intentions with the builtin modifiers
:::

## One-time Queries

Sometimes, it is valueable to query for specific entities at one specific time. It is not worth it to create a new system that only updates once, and for that reason BagelECS exposes `World.prototype.query()`:

```ts
world.query(With(ComponentA));
```

This method also takes the same shorthand as the `System()` function.

## Iterating through a query

Once you define a query, it keeps track of which entities to target while they are changing inside the world. To loop through all the entities targeted at any given time, BagelECS provides 2 methods: Iterators and `.forEach`.

```ts
const query = world.query(ComponentA);

for (const entity of query) {
    console.log(entity.get(ComponentA));
}

query.forEach((ent) => console.log(ent.get(ComponentA)));
```

They both do the same thing, but looks very different. Some people favor the newer `.forEach` methods that are being added to the standard library, and others like old school for loops, so use whichever you like.

:::warning
In my local testing, iterators (`for` loops) were significantly slower than `.forEach`. I suggest testing both, as they could have wildly different performance characteristics based on your program and its host browser.
:::
