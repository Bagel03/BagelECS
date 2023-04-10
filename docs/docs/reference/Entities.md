---
sidebar_position: 2
---

Entities are the building blocks of the world. Any "thing" that exists inside your world is an entity (player, wall, lights, etc.). They hold data in the form of [components](Components.md), which can hold values, and also represent relationships and tags.

:::tip
Entities are actually just `number`s, which is one of the reasons BagelECS is so fast. So while to you it looks like you are calling `ent.add()`, you are actually calling `(0).add()`. This means serializing entities is very easy, and you can pass them around without almost any performance hit.

BagelECS adds some methods to the `Number` prototype, which is generally [frowned upon](https://stackoverflow.com/questions/6223449/why-is-it-frowned-upon-to-modify-javascript-objects-prototypes). However, it is not an issue unless you are using other monkey patching libraries that modify the same entity methods.

That being said, most entity methods require that it's `this` value is a valid entity in the global `World`, so please don't use `(3.14).add(new Pos())` in your code. Use the provided method `World.prototype.spawn()` to get an entity reference
:::

## Creating

To create an entity and get a reference to it, use `World.prototype.spawn`. This automatically adds the entity to the world as well.

```ts
const world = new World(100);
const ent = world.spawn();
```

## Removing

To remove an entity from a world, use `World.prototype.destroy`:

```ts
world.destory(ent);
```

## Adding Components

To add a component, use `Entity.prototype.add`:

```ts
ent.add(new Pos({ x: 1, y: 2 }));
```

If you want to use a custom component ID (To allow multiple components of the same type), supply an `intoId` as the second argument.

```ts
ent.add("Player 1", "name");
ent.add("Red", "team");
```

:::caution
Built-in components (created with `Component()`) can not use custom component ID's
:::

## Removing Components

To remove a given component from an entity, use `Entity.prototype.remove`, with an `intoId` pointing to your component:

```ts
ent.remove(Pos);
ent.remove("name");
ent.remove("team");
```

## Checking for Components

To find if a given entity has a given component, use `Entity.prototype.has`, which also takes an single `intoId`:

```ts
ent.has(Pos);
ent.has("name");
```

If you need to get all the components an entity has, use `Entity.prototype.components`:

```ts
const componentIds = ent.components();
if(componentIds.has(Pos.getId())) {
	...
}
```

**Note:** This returns a `ReadonlySet<number>` containing all the component ID's an entity has. It does not include the actual component data associated with this entity.

## Getting Data

To get a component or a components data from an entity, use `Entity.prototype.get`. There are a few different signatures, all meant to provide the most type inference with the least boilerplate, however, they all require a `typeId`.

When using a base `typeId` literal (most of the time a `number` or `string`), BagelECS doesn't have enough information to know what kind of data is stored there at compile time. Because of this, you have to specify it:

```ts
ent.get("name"); // Return type of any
ent.get<string>("team"); // string
```

However, if you are getting a whole instance of a class (from a library or somewhere else), BagelECS fills in the type for you when you supply the class constructor:

```ts
import { Object3D } from "three";

ent.get(Object3D); // Object3D
```

If you are using built-in components, it also remembers what your schema looks like and uses that to find a return type:

```ts
const Rect = Component({
    pos: {
        x: Type.number,
        y: Type.number,
    },
    col: Type.string,
});

ent.get(Rect.pos.x); // Infered return type of number
ent.get(Rect.pos.y); // number
ent.get(Rect.col); // string
```

:::caution Built-in vs External component API's
You may have noticed how built-in components differ from external components when getting data:

```ts
// External (Built without Component())
ent.get(Object3D).position.x;

// Built-in (With Component())
ent.get(Rect.pos.x);
```

Notice how you specify the property you want as part of the argument when using built-in components. This is because BagelECS doesn't actually hold onto the whole `Rect` object, only the properties it needs, which is the reason it is so fast. However, this means that if you try to get the plain `Rect` object, things will break.

```ts
ent.get(Rect).pos.x++; // Error: ent.get(...).pos is undefined
```

For a longer explanation on why this is the case, see this.

However, this means that you have to get the most specific property you can while using built-in components, or it will break:

```ts
const Deep = Component({
    a: {
        b: {
            c: {
                prop: Type.number,
            },
        },
    },
});

ent.get(Deep).a.b.c.prop; // ❌ Breaks
ent.get(Deep.a).b.c.prop; // ❌ Breaks
ent.get(Deep.a.b.c).prop; // ❌ Breaks

ent.get(Deep.a.b.c.prop); // ✅ Works
```

As of right now, BagelECS is not smart enough to emit a compile time error for these kind of mistakes, however it will mark the return type as `any`, so if you are expecting ts to infer something and it doesn't it could be a clue you messed up somewhere

Note that this obviously does not work with external components

```ts
ent.get(Object3D.position.x); // Object3D does not have property "position"
```

:::

## Updating Data

:::caution
It can be tempting to do something like this:

```ts
ent.get(Rect.pos.x)++;
```

However, this will not effect the data that is held inside the entity, because the call to `ent.get` returns a `number`, which is [passed by value](https://www.geeksforgeeks.org/pass-by-value-and-pass-by-reference-in-javascript/#) in js, so any modifications will effect the "new" `number`, not the one that is stored.
If you are using external components, or have a non-primitive type in your schema, you can update sub-properties of those components using the assignment operator
:::

There are 2 ways of updating component data that already exists on an entity: `Entity.prototype.update` and `Entity.prototype.getSlowRef`:

`update` can update one property at a time and works very similar to add, except you have to specify the full "path" to your data when using built-in components:

```ts
// External components
ent.update(new Object3D(..)); // Overwrite the object I already have stored here with something new

// Built-in components
ent.update(Rect.pos.x, 10);
```

Notice how you still have to follow the same rules that `Entity.prototype.get` sets when updating data.

However, using update can get cumbersome fairly often:

```ts
// Move the entity 1 unit to the right
ent.update(Rect.pos.x, ent.get(Rect.pos.x) + 1);
```

So for cases where performance is not a concern, BagelECS provides `getSlowRef`. As it's name implies, it is _much_ slower than other methods, but it provides a much better developer experience:

```ts
const ref = ent.getSlowRef();
ref[Rect.pos.x]++;
```

It returns a proxy, which allows you to get and set any component values using bracket syntax instead of `.get` and `.update`. However, the property keys (what you put inside the brackets) follows the same rules as `.get`, so the following would still not work:

```ts
ref[Rect].pos.x++; // ❌ Fails again
```

## Extras

There are also a few more entity methods that you should know about:

### `tag()` and `removeTag()`

Attach a tag component (a component without any associated properties/data) to an entity:

```ts
ent.tag("enemy");
ent.removeTag("alive");
```

These interact the same way as other components when using `.has` or world queries:

```ts
// All entities that have been taged as alive
world.query("alive").forEach(..)

// See if it has a tag
ent.has("enemy");
```

### Hierarchy Methods

One of BagelECS's secondary goals is to provide an easy to use, fast hierarchy API. More information can be found on the [hierarchy page](Hierarchy)

### Relationships

BagelECS also supports [flecs](https://flecs.dev) style relationships, documentation and related methods are on the [relationships page](Relationships)
