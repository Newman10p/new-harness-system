import chalk from "chalk";

const COLORS = [chalk.red, chalk.yellow, chalk.green, chalk.cyan, chalk.blue, chalk.magenta];

export function rainbow(text: string): string {
  return text
    .split("")
    .map((ch, i) => COLORS[i % COLORS.length](ch))
    .join("");
}

export function printBanner(name = "Jarvis"): void {
  console.log(rainbow(`\n>>> ${name} harness ready <<<\n`));
}
