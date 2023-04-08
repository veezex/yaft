<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
</script>

<template>
  <v-app>
    <v-main>
      <div>
        <HelloWorld msg="You did it!" />
        <v-icon icon="mdi-account-group" size="large" start />
        <v-icon icon="mdi-checkbox-marked-circle-outline" size="large" end />
      </div>
    </v-main>
  </v-app>
</template>
