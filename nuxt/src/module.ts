import { defineNuxtModule, addVitePlugin, addComponentExports } from "@nuxt/kit";
import iconifyPlugin from "@hlmpn/vite-plugin-iconify";
import type { NuxtConfig as NuxtConfigBase } from "@nuxt/schema";

export interface IconifyNuxtModuleOptions {
	/**
		* Optional prefix applied before the component name (default: "").
		* Example: "Iconify" => <IconifyIcon />.
		*/
	prefix?: string;
}

const nuxtModule = defineNuxtModule<IconifyNuxtModuleOptions>({
	meta: {
		name: "@hlmpn/vite-plugin-iconify/nuxt",
		configKey: "iconify",
	},
	defaults: {
		prefix: "",
	},
	setup(options) {
		addVitePlugin(iconifyPlugin());

		addComponentExports({
			pascalName: "Icon",
			kebabName: "Icon",
			filePath: "@hlmpn/vite-plugin-iconify/vue",
			prefix: options.prefix ?? "",
			global: true,
			mode: "all",
			prefetch: false,
			preload: false,
		});
	},
});

export default nuxtModule;

declare module "@nuxt/schema" {
	interface NuxtConfig extends NuxtConfigBase {
		iconify?: IconifyNuxtModuleOptions;
	}

	interface NuxtOptions {
		iconify?: IconifyNuxtModuleOptions;
	}
}
