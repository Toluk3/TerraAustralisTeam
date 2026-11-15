<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<template>
  <section class="wrap" style="padding-block: 48px">
    <h1>{{ t('home.title') }}</h1>
  </section>
</template>
