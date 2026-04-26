import { buildCiPrompt, parseCiReviewText } from "./review-image-ci.ts";

Deno.test("buildCiPrompt explains the CI JSON contract", () => {
  const prompt = buildCiPrompt("Check whether this VRT output looks broken");
  if (!prompt.includes("strict JSON only")) throw new Error("missing strict JSON instruction");
  if (!prompt.includes('"decision": "pass" | "fail"')) throw new Error("missing decision schema");
  if (!prompt.includes("VRT output looks broken")) throw new Error("missing task prompt");
});

Deno.test("parseCiReviewText accepts plain JSON and fenced JSON", () => {
  const plain = parseCiReviewText('{"decision":"pass","summary":"Looks valid.","issues":[]}');
  if (plain.decision !== "pass") throw new Error(`unexpected decision: ${plain.decision}`);
  if (plain.summary !== "Looks valid.") throw new Error(`unexpected summary: ${plain.summary}`);

  const fenced = parseCiReviewText('```json\n{"decision":"fail","summary":"Header is broken.","issues":["Header is shifted","Image looks clipped"]}\n```');
  if (fenced.decision !== "fail") throw new Error(`unexpected decision: ${fenced.decision}`);
  if (fenced.issues.length !== 2) throw new Error(`unexpected issues length: ${fenced.issues.length}`);
});
