<script setup lang="ts">
import { defineProps } from 'vue';
defineProps({
  icon: {
    type: String,
    required: true,
  },
});


</script>

<template>
<div class="flex flex-col gap-4">
<h2>This is a compiled Vue component.</h2>
<h3>Icon name: {{icon}}</h3>
</div>

</template>