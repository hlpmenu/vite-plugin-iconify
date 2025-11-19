<script setup>

const props = defineProps({
  icon: {
    type: String,
    required: true,
  },
});



</script>


<template>
  <img v-bind="$attrs" v-if="typeof icon === 'string'" :src="`https://api.iconify.design/${icon.replace(':','/')}.svg`"
    :alt="icon" role="img" />
</template>