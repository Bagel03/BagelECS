export * from "../ecs/archetype";
export * from "../ecs/blueprint";
export * from "../ecs/component";
export * from "../ecs/entity";
export * from "../ecs/entity_manager";
export * from "../ecs/hierarchy";
export * from "../ecs/query";
export * from "../ecs/relationships";
export * from "../ecs/resource";
export * from "../ecs/storage";
export * from "../ecs/custom_storages";
export * from "../ecs/system";
export * from "../ecs/system_manager";
export * from "../ecs/worker_manager";
export * from "../ecs/types";
export * from "../ecs/world";
export * from "../utils/class";
export * from "../utils/logger";
export * from "../utils/setFns";
export * from "../utils/walk";
export * from "../utils/types";

import { loadEntityMethods } from "../ecs/entity";
import { loadComponentMethods } from "../ecs/component";
import { loadSetMethods } from "../utils/setFns";

// Load polyfills here
loadEntityMethods();
loadComponentMethods();
loadSetMethods();
