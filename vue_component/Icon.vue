<script setup lang="ts">

const props = defineProps({
  icon: {
    type: String,
    required: true,
  },
});





</script>


<template>
  <img v-bind="$attrs" v-if="typeof icon === 'string' && icon" :src="`https://api.iconify.design/${icon.replace(':','/')}.svg`"
    :alt="icon" role="img" />
</template>