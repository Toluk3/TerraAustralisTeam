<script setup>
import { initials } from '@/content/team.js';
defineProps({
  member: { type: Object, required: true },
  size: { type: Number, default: 96 },
  alt: { type: String, default: '' },
});
</script>

<template>
  <img v-if="member.photo" :src="member.photo" :alt="alt" :width="size" :height="size" class="avatar" loading="lazy" />
  <span v-else class="avatar avatar--empty" role="img" :aria-label="alt || undefined" :aria-hidden="alt ? undefined : 'true'"
    :style="{ '--s': size + 'px' }">{{ initials(member.name) }}</span>
</template>

<style scoped>
.avatar { border-radius: 50%; object-fit: cover; display: block; }
.avatar--empty {
  width: var(--s); height: var(--s); display: grid; place-items: center;
  background: var(--pill); color: var(--muted); font-weight: 400; letter-spacing: 0.02em;
  font-size: calc(var(--s) * 0.26);
}
</style>
