import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "smoke",
		compatibilityDate: "2026-11-13",
		entrypoint,
		env: {
			WORLD: bindings.text("World"),
		},
	},
});
