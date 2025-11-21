[![Build](https://github.com/hlpmenu/vite-plugin-iconify/actions/workflows/build.yml/badge.svg)](https://github.com/hlpmenu/vite-plugin-iconify/actions/workflows/build.yml) [![Lint](https://github.com/hlpmenu/vite-plugin-iconify/actions/workflows/lint.yml/badge.svg)](https://github.com/hlpmenu/vite-plugin-iconify/actions/workflows/lint.yml) [![npm version](https://img.shields.io/npm/v/@hlmpn/vite-plugin-iconify.svg)](https://www.npmjs.com/package/@hlmpn/vite-plugin-iconify) [![npm downloads](https://img.shields.io/npm/dt/@hlmpn/vite-plugin-iconify.svg)](https://www.npmjs.com/package/@hlmpn/vite-plugin-iconify) [![npm registry](https://img.shields.io/badge/npm-registry-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@hlmpn/vite-plugin-iconify)


# Vite Plugin and Nuxt module for Iconify Icons

- Get the dx benefits of `@nuxt/icon`, 
- Use any iconify icon, just like @iconify/vue or @nuxt/icon
- Live updates with dev server/hmr just as usual.

Mainly for Vue, basic react support exists, but it currently only support static props.

But increase render time and performance in prod, by automatically inlining the icons at build or hmr.

**Coming soon:**
- Svg optimizations, including deduping, minification, and spritees
- Options for inlining, or push to a cdn(ex s3,r2,etc)
- Import wrapper for local or remote assets

---

## Installing and adding

### Installing


**npm**
```shell
npm install @hlmpn/vite-plugin-iconify --save
```

**bun**
```shell
bun add @hlmpn/vite-plugin-iconify -s
```

**yarn**
```shell
yarn add @hlmpn/vite-plugin-iconify --save
``` 

## Currently supported cases for inlining:

[Test coverage](test_coverage.md)


## Adding the plugin to a standard vite project

**See below how to add the nuxt module instead**

vite.config.ts / vite.config.js:
```typescript
import IconifyPlugin from "@hlmpn/vite-plugin-iconify";

export default defineConfig({
	plugins: [
		vue() as Plugin<unknown>,
		vueDevTools(),
		IconifyPlugin(), // <-- Add heres
    tailwindcss(),
	],
    // rest of config
});

```
And within your vue components:
```vue
<script setup lang="ts">
import Icon from `@hlmpn/vite-plugin-iconify/vue`; // <-- import the component as `Icon`
import { useRoute } from 'vue-router';
const getIcon = () => "mdi:account";

const toggled = ref(false);
const ghicon = 'mdi:github';
const glicon = 'mdi:gitlab';

const unresolvableAtBuild = () => {
  const route = useRoute();
  if (route.params.id) {
    return `mdi:${route.params.id}`
  }
  return ''
} 

</script>

<template>
  <Icon icon="mdi:account" />
  <Icon :icon="getIcon()" />
<Icon :icon="toggled? ghicon : glicon" class="text-2xl" :class="toggled? 'text-green' : 'text-red'" />
<Icon v-if="unresolvableAtBuild()" :icon="unresolvableAtBuild()" />
</template>
```


## Adding the nuxt module to nuxt

In nuxt.config.ts or nuxt.config.js:
```typescript
import { defineNuxtConfig } from "nuxt/config";


export default defineNuxtConfig({
    modules: ['@hlmpn/vite-plugin-iconify/nuxt'],  // <-- Add here
})

```

Nothing else is needed for nuxt, except maybe remove @nuxt/icon if present.

You do **not** need to import `@hlmpn/vite-plugin-iconify/vue` in your vue components.

Usage in any component:
```vue
<template>
    <Icon icon="mdi:account" /> // or any combo of use like the vite example showed
</template>
```

### Nuxt prefix settings

```typescript
export default defineNuxtConfig({
    modules: ['@hlmpn/vite-plugin-iconify/nuxt'],  // <-- Add here
    iconify: {
        prefix: "Iconify", // <-- Add here if you want to use ex `<IconifyIcon icon="mdi:account" />` instead of Icon
    },
})
```


## Api/Usage

The usage follows `@nuxt/icon`, which means:

```vue
<template>
<IconifyIcon icon="the icon id/name from iconify" />
</template>

```

## Fallback
The fallback will render html like the following:
```html
<img data-v-02281a80="" class="case-function-ternary w-10 h-10" src="https://api.iconify.design/mdi/github.svg" alt="mdi:github" role="img">
```
From:
```vue
<template>
<IconifyIcon icon="mdi:github" />
</template>
```


## Supports dynamic icons

If the icon can be resolved or evaluated at build time, its inlined. 

This means that even dynamic `:icon` attrs, is supported, including imported icon names.

If the icon name is **not** able to be resolved, a fallback `<img>` is used. The complexity of which cases which are able to be resolved, will be increased over time.

Currently 26 of 30 cases is supported. See [add link to to test_coverage.md here]

