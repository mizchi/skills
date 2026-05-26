import {
  buildRequestBody,
  bytesToDataUrl,
  extractAssistantText,
  inferMimeType,
  parseArgs,
} from "./review-image.ts";

Deno.test("parseArgs reads image prompt and flags", () => {
  const parsed = parseArgs([
    "./shot.png",
    "check",
    "this",
    "image",
    "--model",
    "google/gemma-3-4b-it",
    "--json",
  ]);

  if (parsed.image !== "./shot.png") throw new Error(`unexpected image: ${parsed.image}`);
  if (parsed.prompt !== "check this image") throw new Error(`unexpected prompt: ${parsed.prompt}`);
  if (parsed.model !== "google/gemma-3-4b-it") throw new Error(`unexpected model: ${parsed.model}`);
  if (parsed.json !== true) throw new Error("expected json=true");
});

Deno.test("buildRequestBody embeds prompt and image_url content", () => {
  const body = buildRequestBody({
    model: "google/gemini-2.5-flash-lite",
    prompt: "Find visual regressions",
    imageUrl: "data:image/png;base64,abc",
  });
  const messages = body.messages as Array<{ role: string; content: unknown }>;
  const user = messages[1];
  const content = user?.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;

  if (messages[0]?.role !== "system") throw new Error("expected system message first");
  if (content[0]?.text !== "Find visual regressions") throw new Error("prompt not embedded");
  if (content[1]?.image_url?.url !== "data:image/png;base64,abc") throw new Error("image_url not embedded");
});

Deno.test("extractAssistantText accepts string and structured content", () => {
  const fromString = extractAssistantText({
    choices: [{ message: { content: "Looks broken around the header." } }],
  });
  if (fromString !== "Looks broken around the header.") {
    throw new Error(`unexpected text: ${fromString}`);
  }

  const fromParts = extractAssistantText({
    choices: [{ message: { content: [{ type: "text", text: "Image looks valid." }] } }],
  });
  if (fromParts !== "Image looks valid.") {
    throw new Error(`unexpected parts text: ${fromParts}`);
  }
});

Deno.test("inferMimeType and bytesToDataUrl handle common images", () => {
  if (inferMimeType("./demo.webp") !== "image/webp") throw new Error("webp mime mismatch");
  const dataUrl = bytesToDataUrl(new Uint8Array([72, 73]), "image/png");
  if (dataUrl !== "data:image/png;base64,SEk=") {
    throw new Error(`unexpected data url: ${dataUrl}`);
  }
});
