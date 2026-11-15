<template>
  <div class="prose" lang="es">
    <h2>Modo técnico</h2>

    <h3>La problemática</h3>
    <p>
      Terra Australis construye una serie temporal comparable de focos de calor para el Cono Sur
      (Argentina, Chile, Uruguay, Paraguay, Bolivia y Brasil), a partir de las detecciones de los
      sensores MODIS y VIIRS que distribuye NASA FIRMS [1].
    </p>
    <p>
      Cada punto de FIRMS es una anomalía térmica: en MODIS, el centro de un píxel de ~1 km donde el
      algoritmo detectó uno o más fuegos; en VIIRS, el centro de un píxel de 375 m [1][2]. La serie de
      MODIS (satélites Terra y Aqua) es la más larga, ya que arranca en noviembre de 2000, pero el
      sensor está cerca del fin de su vida útil. VIIRS (NOAA-20 y NOAA-21) lo está reemplazando, con
      más resolución y más sensibilidad a fuegos chicos. Su producto de 375 m responde mejor a los
      fuegos pequeños y delimita mejor el perímetro de los grandes [3].
    </p>
    <p>
      Por eso los dos registros no se pueden concatenar. El mismo incendio genera muchos más píxeles
      en VIIRS, y unir los conteos crudos produce un escalón artificial en el momento del cambio de
      sensor. En la muestra S1 (6 países de Sudamérica, 2018–2025), VIIRS sin corregir da
      <strong>3,62 veces</strong> lo que mide MODIS en el mismo período, un sesgo de +262 %. Ese
      cociente además cambia según la región: en datos crudos de 2020 da ≈3,5 en Argentina, ≈4,0 en
      Brasil y ≈5,3 en Australia. También es distinto de día y de noche, así que un único factor
      global no alcanza.
    </p>

    <h3>Cómo se planteó</h3>
    <p>
      El proyecto tiene dos partes: un pipeline que armoniza MODIS y VIIRS en una escala común, y una
      aplicación web que muestra la serie resultante.
    </p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Componente</th><th>Cómo está hecho</th></tr>
        </thead>
        <tbody>
          <tr><td>Conversión entre sensores</td><td>Factores <code>k</code> por cociente de sumas, con bootstrap</td></tr>
          <tr><td>Grilla espacial</td><td>Hexágonos H3: r8 (clusters), r7 (mapa), r3 → r2 → r1 → global (calibración)</td></tr>
          <tr><td>Entrega de datos</td><td>JSON estáticos generados desde la publicación del pipeline, sin backend</td></tr>
          <tr><td>Mapa</td><td>MapLibre + deck.gl, con mapas base OpenFreeMap y Esri</td></tr>
        </tbody>
      </table>
    </div>
    <p>
      El pipeline está escrito en Python con DuckDB y H3 y corre en etapas:
      <code>ingest → normalize → support → aggregate → detect → calibrate → rollup → validate → qc → zone → export</code>.
      Cada artefacto guarda un <code>config_hash</code>: si cambia la configuración o los archivos de
      entrada, el pipeline se niega a reutilizar factores de calibración viejos.
    </p>

    <h3>Cómo se resolvió</h3>
    <p>
      <strong>1. Esquema común y filtros.</strong> Los productos MODIS y VIIRS se llevan a un esquema
      único con brillo, FRP, confianza normalizada, tiempo solar local y procedencia de cada fila.
      Después se aplican tres filtros. Se excluyen las detecciones que no son de vegetación
      (<code>type ≠ 0</code>: volcanes, fuentes industriales estáticas, offshore). Se excluyen las de
      confianza baja, con un umbral común <code>nominal</code>. Y se excluyen las fuentes persistentes
      con una máscara estática en celdas r8, que hace falta porque los datos casi en tiempo real (NRT)
      no traen el campo <code>type</code>.
    </p>
    <p>
      <strong>2. Métrica.</strong> En lugar de contar píxeles se cuentan clusters, es decir, celdas H3
      r8 distintas con fuego en una misma pasada. Eso atenúa la diferencia de resolución. La métrica
      configurada es <code>n_clusters_det</code>. De día es igual a contar clusters. De noche, cada
      cluster VIIRS pesa según la probabilidad de que MODIS lo hubiera detectado dada su potencia
      radiativa (FRP). Esa probabilidad se estima en seis tramos de FRP, de menos de 1 MW a 10 MW o
      más, por región, comparando con las detecciones de Aqua en la misma celda r7 y la misma noche.
      Aqua cruza a la misma hora que NOAA-20, alrededor de la 1:30.
    </p>
    <p>
      <strong>3. Calibración.</strong> En el período de solape (NOAA-20, de abril de 2018 a diciembre
      de 2021) se ajusta <code>k = Σ referencia / Σ fuente</code>, estratificado por región, mes,
      día/noche y plataforma. Cuando un estrato tiene pocas observaciones, se recurre a un nivel más
      amplio: r3 → r2 → r1 → global. La incertidumbre se estima con réplicas bootstrap (bandas
      p05–p95). La referencia es Terra + Aqua.
    </p>
    <p>
      <strong>4. Composición de la serie.</strong> Hasta el 31/12/2021 se usa MODIS observado; desde
      el 01/01/2022, VIIRS × <code>k</code>. Los factores se aplican a los agregados diarios antes de
      armar meses o ventanas de 8 días. La anomalía se mide contra la mediana de 2003–2021 y solo se
      informa en períodos de cobertura completa. Se distingue además entre "sin detecciones" y "sin
      cobertura", para que un cero nunca se asigne a fechas en las que un sensor no estaba operando.
    </p>
    <p>
      <strong>5. Validación.</strong> Se evalúa dejando un año afuera. El criterio de aceptación pide
      que el cociente armonizado/MODIS de cada año quede entre 0,9 y 1,1 (día + noche, y solo día) y
      que el sesgo anual no supere ±10 %. En Argentina, frente a contar clusters sin ponderar, el peor
      año nocturno baja de 18,4 % a 15,5 % de error y el error mediano nocturno baja de 0,198 a 0,104.
      En S1, el sesgo queda en +0,05 %, con un cociente predicho/observado de 1,000.
    </p>

    <h3>Errores y problemas encontrados</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Problema</th><th>Qué pasaba</th><th>Cómo se resolvió</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Fuentes que no son fuego</td>
            <td>En Qatar, el 83 % de las detecciones MODIS y el 88 % de las VIIRS son <code>type=2</code> (quema de gas en pozos petroleros).</td>
            <td>Filtro por <code>type</code> y máscara estática r8.</td>
          </tr>
          <tr>
            <td>Cobertura desigual al inicio</td>
            <td>MODIS 2000 arranca el 1/11 y solo con Terra; Aqua aparece en julio de 2002.</td>
            <td>Referencia Terra + Aqua con ajuste del tramo de Terra sola, y calendario de operación por plataforma.</td>
          </tr>
          <tr>
            <td><code>k</code> nocturno inestable</td>
            <td>Variaba con la proporción de fuegos débiles. En Argentina, 2018 tuvo 40 % de clusters por debajo de 1,5 MW y su cociente nocturno dio 1,18. Un umbral fijo de FRP no alcanza, porque la detección de MODIS crece de forma gradual.</td>
            <td>Pesos de detectabilidad por tramo de FRP (<code>n_clusters_det</code>).</td>
          </tr>
          <tr>
            <td>Nivel global de <code>k</code></td>
            <td>Entre el 12 % y el 28 % de la serie VIIRS caía en el nivel global, que mezcla continentes.</td>
            <td>Se agregó el nivel r1 y una calibración común a todos los lotes.</td>
          </tr>
          <tr>
            <td>1/<code>k</code> explotaba</td>
            <td>En la vista en escala VIIRS, un <code>k</code> regional con pocos focos MODIS llevaba 1/<code>k</code> hasta 33.</td>
            <td>Mínimo de 100 focos de referencia para aceptar un nivel regional.</td>
          </tr>
          <tr>
            <td>Confianza no equivalente</td>
            <td>Con el umbral <code>high</code>, de noche VIIRS casi no marca esa clase y <code>k</code> queda inestable.</td>
            <td>Umbral común <code>nominal</code>; <code>high</code> queda solo para pruebas de sensibilidad.</td>
          </tr>
          <tr>
            <td>Solape corto</td>
            <td>No hay archivos de S-NPP en los datos del proyecto, y FIRMS no publica NOAA-21 por país.</td>
            <td>La serie usa NOAA-20, y NOAA-21 hereda su <code>k</code>. El solape queda en 3,75 años en lugar de unos 10.</td>
          </tr>
          <tr>
            <td><code>export</code> sin memoria</td>
            <td>La mediana por celda armaba un producto cruzado de 2,69 M celdas × 48 meses. Llenaba 110 GB de temporal y terminaba con error de memoria.</td>
            <td>Mediana calculada sobre listas (<code>list_resize</code> + <code>list_aggregate</code>). Pasó de no terminar a 96 segundos, con el mismo resultado.</td>
          </tr>
          <tr>
            <td>La máscara del mapa tapaba países</td>
            <td>Con varios países como agujeros que comparten frontera, la triangulación cubría países enteros.</td>
            <td><code>MaskExtension</code> de deck.gl en modo invertido.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <h3>Límites abiertos</h3>
    <ul>
      <li>La noche de 2020 en Argentina da un cociente de 1,155, casi todo por octubre: fueron los incendios de Córdoba, más intensos que el resto del solape.</li>
      <li>El <code>k</code> es regional, así que en zonas chicas puede alejarse de lo observado. En la prueba con Río Negro y Neuquén, VIIRS × <code>k</code> dio entre 1,03 y 1,22 de MODIS en los años del solape.</li>
      <li>La métrica se eligió con la validación de cuatro lotes (Argentina, Cono Sur, Brasil y un lote de contraste).</li>
      <li>La serie es de detecciones armonizadas y puede tener valores fraccionarios. No identifica perímetros ni causas, y un cero no prueba que no hubo fuego.</li>
    </ul>
  </div>
</template>
