import {
    Component,
    CustomSystem,
    System,
    Type,
    World,
} from "../src/exports/index.js";

const Vec = Component(
    {
        x: Type.number,
        y: Type.number,
    },
    {
        add(x: number, y: number): void {
            this.x += x;
            this.y += y;
        },
    }
);

class MovementSys extends CustomSystem(Vec) {
    update(): void {
        this.entities.forEach((ent) => Vec.add(ent, 1, 1));
    }
}

const world = new World(100);
world.addSystem(MovementSys);

const ent = world.spawn();

ent.add(new Vec({ x: 1, y: 1 }));

world.update();
