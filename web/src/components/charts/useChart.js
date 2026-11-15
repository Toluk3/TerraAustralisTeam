/**
 * ECharts con solo los módulos usados. Inicializa, sigue el tamaño del contenedor (ResizeObserver),
 * se redibuja al cambiar idioma o tema y se destruye al desmontar. Los colores salen de las variables CSS.
 */
import { onBeforeUnmount, onMounted, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useI18n } from 'vue-i18n';
import { ui, effectiveTheme } from '@/stores/ui.js';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

/** Lee los tokens de color del tema actual. */
export function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), line: v('--line'), lineStrong: v('--line-strong'),
    surface: v('--surface'), a: v('--period-a'), b: v('--period-b'), aBg: v('--period-a-bg'), bBg: v('--period-b-bg'),
    font: v('--font-body') || 'Poppins, sans-serif',
  };
}

/**
 * el: ref al contenedor. build(colors) → option de ECharts (se llama de nuevo con cada cambio de deps,
 * idioma o tema). onClick(params) opcional.
 */
export function useChart(el, build, deps, { onClick } = {}) {
  const { locale } = useI18n();
  let chart = null;
  let ro = null;

  function render() {
    if (!chart) return;
    const option = build(themeColors());
    if (!option) { chart.clear(); return; }
    chart.setOption(option, { notMerge: true, lazyUpdate: true });
  }

  onMounted(() => {
    chart = echarts.init(el.value, null, { renderer: 'canvas' });
    if (onClick) chart.on('click', onClick);
    ro = new ResizeObserver(() => chart?.resize());
    ro.observe(el.value);
    render();
  });
  onBeforeUnmount(() => { ro?.disconnect(); chart?.dispose(); chart = null; });

  // El tema cambia el atributo de <html>: se espera un cuadro para leer las variables ya aplicadas
  watch(() => [locale.value, ui.theme, ui.systemDark, effectiveTheme()], () => requestAnimationFrame(render));
  watch(deps, render, { deep: false });
  return { render, get chart() { return chart; } };
}
