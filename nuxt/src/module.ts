import { defineNuxtModule, addVitePlugin } from "@nuxt/kit";
import iconifyPlugin from "../../";
import type { NuxtModule } from "@nuxt/schema";

const nuxtModule = defineNuxtModule<NuxtModule>({
	meta: {
		name: "@hlmpn/vite-plugin-iconify/nuxt",
		configKey: "iconify",
	},
	setup() {
		addVitePlugin(iconifyPlugin());
	},
});

export default nuxtModule;
