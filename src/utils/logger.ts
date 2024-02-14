const IS_WORKER = typeof importScripts == "function";

export class Logger {
    public context: string;
    private color: string;

    constructor(...context: string[]) {
        this.context = typeof context === "string" ? context : context.join(" > ");

        this.color = `hsl(${
            JSON.stringify(context)
                .split("")
                .reduce((seed, val) => val.charCodeAt(0) + ((seed << 5) - seed), 0) %
            360
        }, 70%, 60%)`;
    }

    group(...data: any[]) {
        console.group(...this.generateContextPrefix("⠀⠀", "I", "bgWhite", data));
    }

    groupCollapsed(...data: any[]) {
        console.groupCollapsed(
            ...this.generateContextPrefix("⠀⠀", "I", "bgWhite", data)
        );
    }

    groupEnd() {
        console.groupEnd();
    }

    log(...data: any[]) {
        this.info(...data);
    }

    logOk(...data: any[]) {
        console.log(...this.generateContextPrefix("✔️", "O", "bgGreen", data));
    }

    debug(...data: any[]) {
        console.log(...this.generateContextPrefix("⠀⠀", "D", "bgGray", data));
    }

    info(...data: any[]) {
        console.info(...this.generateContextPrefix("⠀⠀", "I", "bgWhite", data));
    }

    warn(...data: any[]) {
        console.warn(...this.generateContextPrefix("⚠️", "W", "bgYellow", data));
    }

    error(...data: any[]) {
        console.error(...this.generateContextPrefix("❌", "!", "bgRed", data));
    }

    generateContextPrefix(
        emoji: string,
        type: string,
        bgColor: string,
        data: any[]
    ) {
        let col = this.color,
            extra = "";

        switch (type) {
            case "O":
                col = "lime";
                break;
            case "!":
                col = "red";
                break;
            case "W":
                col = "yellow";
                break;
            case "D":
                col = "#888";
                extra = data.join(" ");
                data = [];
                break;
            case "I":
                col = this.color;
                break;
        }

        if (IS_WORKER) {
            emoji = "⚙️";
        }

        return [
            `%c ${emoji} %c ` + this.context.padEnd(25, " ") + " %c " + extra,
            `background: ${col}; color: #fff; padding: 2px 5px 0 5px;  border-top-left-radius: 3px; border-bottom-left-radius: 3px;`,
            `background: #333438; color: ${col}; border-top-right-radius: 3px; border-bottom-right-radius: 3px; padding-top: 2px`,
            "color: gray",
            ...data,
        ];
    }
}
