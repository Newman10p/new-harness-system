import { loadConfig } from "../config";
import { printBanner } from "./banner";

const config = loadConfig();
printBanner(config.assistantName ?? "Jarvis");
