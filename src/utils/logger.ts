function getColorFromTag(tag: string): string {
    let seed = 0;
    for (let i = 0; i < tag.length; i++)
        seed = tag.charCodeAt(i) + ((seed << 5) - seed);

    return `hsl(${seed % 360},70%,60%)`;
}

export class Logger {
    private static readonly tagPadding: number = 30;

    constructor(
        private readonly tag: string,
        private readonly color: string = getColorFromTag(tag)
    ) {}

    group(...info: any) {
        console.groupCollapsed(...this.getEmojiStyleArr(" "), ...info);
    }

    groupEnd() {
        console.groupEnd();
    }

    log(...info: any) {
        console.log(...this.getEmojiStyleArr(" "), ...info);
    }

    info(...info: any) {
        console.info(...this.getEmojiStyleArr("💬"), ...info);
    }

    ok(...info: any) {
        console.log(...this.getEmojiStyleArr("✅"), ...info);
    }

    warn(...info: any) {
        console.warn(...this.getEmojiStyleArr("⚠"), ...info);
    }

    error(...info: any) {
        console.error(...this.getEmojiStyleArr("❌"), ...info);
    }

    getEmojiStyleArr(emoji: string) {
        return [
            `%c ${emoji}  %c ${this.tag.padEnd(Logger.tagPadding, " ")} `,
            `background: ${
                this.color
                // this.color ? this.color : "#44484a"
            }; color: #aaa; padding: 0 5px; border-top-left-radius: 4px; border-bottom-left-radius: 5px;`,
            `background: ${
                this.color
                // this.color ? this.color + "7f" : "#333438"
            }; color: #aaa; border-top-right-radius: 4px; border-bottom-right-radius: 4px;`,
        ];
    }
}
