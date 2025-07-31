const moment = require("moment");
class Log {
    static init() {
        this.using = ["info", "warn", "error", "success"];
    }

    static info(message) {
        if(!this.using) this.init();

        if(this.using.includes("info")) console.info(`\x1b[38;2;104;205;240m[${moment().format('YYYY-MM-DD HH:mm:ss')}] [INFO]\x1b[0m ${message}`);
    }

    static warn(message) {
        if(!this.using) this.init();

        if(this.using.includes("warn")) console.warn(`\x1b[38;2;189;96;45m[${moment().format('YYYY-MM-DD HH:mm:ss')}] [WARN]\x1b[0m ${message}`);
    }

    static error(message) {
        if(!this.using) this.init();

        if(this.using.includes("error")) console.error(`\x1b[38;2;255;76;44m[${moment().format('YYYY-MM-DD HH:mm:ss')}] [ERROR]\x1b[0m ${message}`);
    }

    static success(message) {
        if(!this.using) this.init();
        
        if(this.using.includes("success")) console.info(`\x1b[38;2;51;188;153m[${moment().format('YYYY-MM-DD HH:mm:ss')}] [SUCCESS]\x1b[0m ${message}`);
    }
}
module.exports = Log;
