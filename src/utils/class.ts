import { Class } from "./types";

/** @internal */
export const isClass = (val: any): val is Class<any> => {
    return typeof val === "function" && val.toString().startsWith("class");
};
