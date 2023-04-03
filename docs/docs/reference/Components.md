---
sidebar_position: 3
---

Components hold all the data that is contained inside [entities](Entities.md). BagelECS has 2 kinds of components: "Built-in" and "External"; Built-in components are made specifically for BagelECS, and benefit from all of BagelECS' performance optimizations. External components are things that come from other libraries, and allow you greater flexibility over what you want to do.

## External Components

These are the "simpler" components: any class that wasn't built with the `Component()` function. Most of the time these are objects from external libraries, as it is recommended to use `Component` for components you write specifically for BagelECS.

## Built-in Components

These are components built with the `Component()` function, and are slightly more complicated to work with (But still very easy), but much faster.

### Creating a Built-in Component

To define a built-in component, use the `Component()` function:

```ts
import { Component, Type } from "bagelecs";
const Vec = Component({
    x: Type.number,
    y: Type.number,
});
```

The first argument, `schema`, defines the shape of the component. Unlike external components, BagelECS only keeps track of exactly what a built-in component needs, and not a bunch of other slow references. The schema tells BagelECS is a tree of different `TypeIds`, and tells BagelECS what data to keep track of. It can be very simple (as shown above, or a deeply nested tree of properties).

:::tip
Because `Component()` is only called once when defining the component, it never has a real performance hit on your app. So don't be afraid to create more complex / deeply nested schemas.
:::

#### Types

The following are all the built-in types that you can use while defining your component:

```ts
const all = Component({
    number: Type.number,
    boolean: Type.bool,
    any: Type.any,
    string: Type.string,
    entity: Type.entity,
});
```

In addition, you can use a few methods under `Type` to get access to more complex types:

```ts
// Use Type.custom<T>() for ones that aren't included
Type.custom<Set<number>>();
// You can also supply a value of type T
Type.custom(new Set<number>());

// If you have a component that fits into another component, you can use Type.component:
Type.component(Vec);

// For enum values, use Type.enum:
Type.enum("A", "B", "C");

// To make any type nullable, wrap it in Type.nullable:
Type.nullable(Type.enum("D", "E", "F"));

// If you need a nullable built-in type (number, bool, any, string, entity), you can also just provide that string:
Type.nullable("number");
Type.nullable("entity");
```

All of these return a `TypeId`, which you use when accessing a components data within an entity. For that reason, using the correct type when defining the schema will result in correct tapings in any place that component is referenced (`ent.get()`).

### Using Built-in Components

After you define a component, you get a class that can be instantiated when adding it to an entity:

```ts
const Vec = Component({
    x: Type.number,
    y: Type.number,
});

ent.add(new Vec({ x: 1, y: 1 }));
```

You have to supply one value: An object that is the same shape as the component's schema, excepts it contains concreate types instead of `TypeId`s.

The class also holds all of the schema's property IDs as static properties:

```ts
const Vec = Component({
    x: Type.number,
    y: Type.number,
});

Vec.x; // TypeId<number>
Vec.y; // TypeId<number>
```

These are used when retrieving data:

```ts
console.log(`Entity is @ ${ent.get(Vec.x)}, ${ent.get(Vec.y)}`);
```

As well as when updating data:

```ts
ent.update(Vec.x, 2);
ent.update(Vec.y, 0);
```

For more information, check out the [entities](Entities.md) page, specifically the _Built-in vs External component API's_ warning.
