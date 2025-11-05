<template>
  <div ref="root">
    <slot />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const root = ref(null)

onMounted(() => {
  // Use a timeout to ensure Mermaid has loaded and the DOM is fully updated.
  setTimeout(() => {
    if (window.mermaid && root.value) {
      // Re-initialize to be safe, especially with Vite's HMR.
      window.mermaid.initialize({ startOnLoad: false });
      // Find all mermaid blocks within this component and render them.
      const mermaidBlocks = root.value.querySelectorAll('pre.mermaid');
      if (mermaidBlocks.length > 0) {
        window.mermaid.run({
          nodes: mermaidBlocks
        });
      }
    }
  }, 100); // A small delay can often help with timing issues.
})
</script>
