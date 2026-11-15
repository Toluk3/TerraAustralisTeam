<script setup>
import { useI18n } from 'vue-i18n';
import { useLiveFigure } from '@/features/useLiveFigure.js';

const { t } = useI18n();
const { liveText } = useLiveFigure();
</script>

<template>
  <section class="wrap" style="padding-block: 48px">
    <h1>{{ t('home.title') }}</h1>
    <p aria-live="polite"><span class="dot" aria-hidden="true"></span> {{ liveText }}</p>
  </section>
</template>
