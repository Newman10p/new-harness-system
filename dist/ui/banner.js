"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.printBanner = printBanner;
const chalk_1 = __importDefault(require("chalk"));
function blueGreen(text) {
    return text
        .split("")
        .map((ch, index) => (index % 2 === 0 ? chalk_1.default.blue(ch) : chalk_1.default.green(ch)))
        .join("");
}
function printBanner(name = "Jarvis") {
    console.log(blueGreen(`\n>>> ${name} harness ready <<<\n`));
}
//# sourceMappingURL=banner.js.map