"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../config");
const banner_1 = require("./banner");
const config = (0, config_1.loadConfig)();
(0, banner_1.printBanner)(config.assistantName ?? "Jarvis");
//# sourceMappingURL=bannerCli.js.map