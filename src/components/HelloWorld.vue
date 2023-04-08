<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  msg: string
}>()

const counter = ref(0)
</script>

<template>
  <div>
    <h1>{{ msg }}</h1>
    <h3>
      You’ve successfully created a project with
      <a href="https://vitejs.dev/" target="_blank" rel="noopener">Vite</a> +
      <a href="https://vuejs.org/" target="_blank" rel="noopener">Vue 3</a>.
    </h3>

    <v-btn variant="flat" color="red-darken-1" @click="counter++">
      Button {{ counter }}
      <v-icon end icon="mdi-checkbox-marked-circle"></v-icon>
    </v-btn>
  </div>
</template>
