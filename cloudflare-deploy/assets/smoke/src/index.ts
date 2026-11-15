import { env } from "cloudflare:workers";

export default {
	fetch() {
		return new Response(`Hello ${env.WORLD}!`);
	},
} satisfies ExportedHandler;
