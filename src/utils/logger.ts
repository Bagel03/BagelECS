export abstract class Logger {
    static log(...data: any) {
        console.log(...data);
    }

    static logOK(data: string) {
        this.log("%c" + "✅  " + data, "color:#84f774ff;font-weight:bold;");
    }
}
