## Adding the nuxt module to nuxt

In nuxt.config.ts or nuxt.config.js:
```typescript
import { defineNuxtConfig } from "nuxt/config";


export default defineNuxtConfig({
    modules: ['@hlmpn/vite-plugin-iconify/nuxt'],  // <-- Add here
})

```

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
        prefix: "YourPrefix", // <-- Add here if you want to use ex `<IconifyIcon icon="mdi:account" />` instead of Icon
    },
})
```

---

## Api/Usage

The usage follows `@nuxt/icon`, which means:

```vue
<template>
<Icon icon="the icon id/name from iconify" />
</template>

```

Or if `prefix` is assigned:
```vue
<template>
<YourPrefixIcon icon="the icon id/name from iconify" />
```

And exampls of dynamic usage:
And within your vue components:
```vue
<script setup lang="ts">
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

