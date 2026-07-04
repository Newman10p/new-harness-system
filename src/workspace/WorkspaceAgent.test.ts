import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkspacePlan } from "./WorkspaceAgent";

test("parseWorkspacePlan extracts JSON steps from model output", () => {
  const text = `Sure — here is the plan:\n\n{ "goal": "Create a todo note", "steps": [{ "action": "create_file", "path": "./docs/todo.md", "content": "- [ ] Write docs" }] }`;

  const plan = parseWorkspacePlan(text);

  assert.equal(plan.goal, "Create a todo note");
  assert.equal(plan.steps[0].action, "create_file");
  assert.equal(plan.steps[0].path, "./docs/todo.md");
  assert.equal(plan.steps[0].content, "- [ ] Write docs");
});
