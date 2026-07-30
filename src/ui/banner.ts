import chalk from "chalk";

function blueGreen(text: string): string {
  return text
    .split("")
    .map((ch, index) => (index % 2 === 0 ? chalk.blue(ch) : chalk.green(ch)))
    .join("");
}

export function printBanner(name = "Jarvis"): void {
  console.log(blueGreen(`\n>>> ${name} harness ready <<<\n`));
}
