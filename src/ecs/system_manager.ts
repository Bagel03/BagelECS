import { Tree } from "../utils/types";
import { Query } from "./query";
import { BagelSystem, SystemOrdering } from "./system";
import { World } from "./world";

export const SystemType = {
    LOCAL: 0,
    REMOTE: 1,
} as const;
export type SystemType = (typeof SystemType)[keyof typeof SystemType];

export class SystemManager {
    public localSystems: BagelSystem<any>[] = [];

    // Change this to change the max number of systems
    public readonly systemLocations = new Uint8Array(100);

    public readonly schedules: Record<
        string,
        { first: number[]; standard: number[]; last: number[] }
    > = {};
    public readonly enabledSchedules: Record<string, number[]> = {};

    constructor(private readonly world: World) {
        this.createSchedule("DEFAULT");
    }

    private reorderEnabled(schedule: string) {
        const copy = this.enabledSchedules[schedule].slice();
        const working = this.enabledSchedules[schedule];

        working.length = 0;

        const { first, standard, last } = this.schedules[schedule];
        working.push(
            ...[...first, ...standard, ...last].filter((x) => copy.includes(x))
        );
    }

    private registerSystem(id: number, type: SystemType = SystemType.REMOTE) {
        this.systemLocations[id] = type;
        // this.enabled.add(id);
    }

    // createSchedule(name: string, ...systems: number[]): void;
    // createSchedule(name: string, systems: {first?: number[], default?: number[], last?: number[]}): void;
    createSchedule(name: string, ...systems: number[]) {
        this.schedules[name] = { first: [], standard: systems, last: [] };
        this.enabledSchedules[name] = [];
    }

    addToSchedule(
        id: number,
        schedule: string,
        ordering: SystemOrdering,
        enabled: boolean
    ) {
        const scheduleArr = (this.schedules[schedule] ??= {
            first: [],
            standard: [],
            last: [],
        });
        const { first, standard, last } = scheduleArr;

        // Use match here in the future
        if (
            ordering === "STANDARD" ||
            ordering === "LAST" ||
            ordering === "FIRST"
        ) {
            scheduleArr[ordering.toLowerCase()].push(id);
        } else if ("position" in ordering) {
            // Decide which one to go into and add it
            if (ordering.position < first.length) {
                first.splice(ordering.position, 0, id);
            } else if (ordering.position < first.length + standard.length) {
                standard.splice(ordering.position - first.length, 0, id);
            } else {
                last.splice(
                    ordering.position - first.length - standard.length,
                    id
                );
            }
        } else {
            // before or after
            const kind = Object.keys(ordering)[0];
            const relativeTo: number = (ordering as any)[kind];

            const arr = [first, standard, last].find((arr) =>
                arr.includes(relativeTo)
            )!;
            const idx = arr.indexOf(relativeTo);

            arr.splice(idx + (kind === "before" ? 0 : 1), 0, id);
        }

        if (enabled) {
            this.enable(id, schedule);
        }
    }

    enable(id: number, schedule: string) {
        if (this.enabledSchedules[schedule].includes(id)) return;

        this.enabledSchedules[schedule].push(id);
        this.reorderEnabled(schedule);
    }

    disable(id: number, schedule: string) {
        this.enabledSchedules[schedule].splice(
            this.enabledSchedules[schedule].indexOf(id),
            1
        );
        // this.enabled.delete(id);
    }

    addSystem(system: BagelSystem<any>) {
        //@ts-expect-error
        const { id } = system.constructor;
        this.localSystems[id] = system;
        this.registerSystem(id, SystemType.LOCAL);

        // Register system queries
        const registerQueryTree = (queries: Tree<Query>) => {
            if (queries instanceof Query) {
                this.world.queryManager.addQuery(queries);
                return;
            }

            for (const query of Object.values(queries)) {
                registerQueryTree(query);
            }
        };

        registerQueryTree(system.entities);
    }

    addRemoteSystem(id: number) {
        this.registerSystem(id, SystemType.REMOTE);
    }

    update(schedule?: string): Promise<void>;
    update(systems: number[]): Promise<void>;

    update(arg: string | number[] = "DEFAULT") {
        let systems: number[];

        if (typeof arg === "string") systems = this.enabledSchedules[arg];
        else systems = arg;

        const promises = [];

        for (const systemId of systems) {
            if (this.systemLocations[systemId] == SystemType.REMOTE) {
                promises.push(this.world.workerManager.update(systemId));
            } else {
                this.localSystems[systemId].update();
            }
        }

        return Promise.all(promises) as any as Promise<void>;
    }
}

/**  End API
 *
 * world.addSystem(A, {before: B})
 *
 * or
 *
 * System A {
 *  runOrdering: {
 *      before: B
 * }
 *
 * world.addSystem(A)
 *
 *
 */
