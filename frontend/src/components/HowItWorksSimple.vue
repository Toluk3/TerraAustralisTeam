<template>
  <div class="prose" lang="es">
    <h2>El problema</h2>
    <p>
      Desde el año 2000, satélites de la NASA recorren la Tierra y registran los puntos de la
      superficie que están mucho más calientes que su entorno. Cada uno de esos puntos es una
      "anomalía térmica": lo más probable es que sea un fuego, pero también puede ser cualquier otra
      fuente de calor intensa [1][4]. NASA reúne estos registros en un sistema llamado FIRMS, que se
      creó justamente para dar información de incendios a quienes manejan bosques y territorios [5].
    </p>
    <p>
      Durante casi veinte años, el sensor que hizo ese trabajo se llamó MODIS. Hoy está siendo
      reemplazado por uno más nuevo, VIIRS, que ve con mucho más detalle: MODIS divide el suelo en
      cuadrados de un kilómetro de lado, y VIIRS en cuadrados de 375 metros [1]. Gracias a eso, VIIRS
      detecta fuegos más chicos [3].
    </p>
    <p>
      Es como cambiar una cámara de pocos megapíxeles por una de muchos. La nueva ve más detalle y el
      mismo incendio aparece como muchos más puntos. Si se unen los dos registros sin más, parece que
      de un año a otro hay unas tres veces y media más fuego, cuando lo único que cambió fue la cámara.
    </p>

    <h2>Cómo lo resolvimos</h2>
    <p>
      Durante casi cuatro años, de 2018 a 2021, los dos sensores funcionaron al mismo tiempo.
      Comparamos lo que cada uno vio sobre los mismos lugares y los mismos días, y con eso calculamos
      cuánto hay que "traducir" lo que ve VIIRS para que hable en la misma escala que MODIS. Esa
      traducción no es un único número: cambia según la región, la época del año y si es de día o de
      noche, porque de noche el sensor viejo se pierde muchos fuegos débiles.
    </p>
    <p>
      Además dividimos el territorio en hexágonos iguales y contamos hexágonos con fuego en lugar de
      puntos sueltos, lo que reduce la diferencia de detalle entre los dos sensores. También limpiamos
      lo que no es fuego de vegetación, como chimeneas industriales, quemas de gas o volcanes, que los
      satélites también registran como puntos calientes.
    </p>
    <p>
      Por último, probamos el método. Estimamos años que ya conocíamos como si no los hubiéramos
      visto, y el resultado quedó dentro de un 10 % de lo que se había medido.
    </p>

    <h2>Por qué importa</h2>
    <p>
      Con una serie comparable se puede ver qué meses concentran más fuego en cada lugar, qué años
      fueron peores y si un período está por encima o por debajo de lo habitual. Esa mirada larga
      sirve para entender cómo cambia el fuego en la región y para planificar la prevención y los
      recursos de combate en los meses de mayor riesgo.
    </p>
    <p>
      En el Cono Sur no hay una única temporada de incendios. En la mayor parte de Sudamérica los
      meses críticos coinciden con la estación seca, que cambia según la geografía, y en general los
      incendios se concentran entre julio y octubre [9]. En el Pantanal, la estación seca va de abril
      a octubre [10]. En cambio, en el sur de Argentina el riesgo más alto va de diciembre a marzo
      [6], en pleno verano. Por eso el mapa permite comparar cada mes con lo que es normal para ese
      mismo lugar.
    </p>
    <p>Algunos incendios de los últimos años muestran la escala del problema en la región:</p>
    <ul>
      <li>
        <strong>Cuesta del Ternero, Río Negro (Argentina), 2021.</strong> Empezó el 24 de enero y
        siguió activo durante semanas [11]. Afectó miles de hectáreas de lengas, cipreses y otras
        plantas nativas [12].
      </li>
      <li>
        <strong>Pantanal (Brasil), 2020.</strong> Los incendios quemaron alrededor del 30 % del
        Pantanal brasileño, el mayor humedal del mundo, en un año de sequía extrema [13]. Afectaron al
        45 % de los yaguaretés del bioma, unos 740 ejemplares [14].
      </li>
      <li>
        <strong>Corrientes (Argentina), 2022.</strong> A fines de febrero, el fuego ya había superado
        el millón de hectáreas [15], incluidos sectores de los Esteros del Iberá.
      </li>
      <li>
        <strong>Valparaíso (Chile), 2024.</strong> Fue la ola de incendios más mortífera de la
        historia de Chile: la Fiscalía contabilizó 138 personas fallecidas [16].
      </li>
    </ul>
    <p class="note">
      <strong>Para tener en cuenta:</strong> un punto en el mapa es una detección satelital, no un
      incendio confirmado. Que no haya puntos tampoco garantiza que no hubo fuego: por ejemplo, las
      nubes pueden tapar la vista del satélite. Esta herramienta sirve para explorar la historia del
      fuego, pero no reemplaza a los sistemas oficiales de alerta de cada país.
    </p>

    <h2>Tipos de incendios</h2>
    <p>Según dónde ocurren y qué afectan, se distinguen tres tipos de incendio [17]:</p>
    <ul>
      <li><strong>Estructural:</strong> en casas, edificios o locales.</li>
      <li>
        <strong>De interfase:</strong> en zonas donde la vegetación se mezcla con viviendas u otras
        construcciones. El incendio de Valparaíso de 2024 es un ejemplo de lo grave que puede ser.
      </li>
      <li>
        <strong>De vegetación (forestal o rural):</strong> se propaga por bosques, pastizales,
        humedales o campos y causa efectos no deseados.
      </li>
    </ul>
    <p>
      Según por dónde avanza el fuego, los incendios de vegetación también se clasifican en tres
      tipos, que pueden darse combinados en un mismo incendio [18]:
    </p>
    <ul>
      <li>
        <strong>De superficie:</strong> el fuego avanza a ras del suelo, sobre pastos, hojas, ramas y
        arbustos chicos [19].
      </li>
      <li>
        <strong>De copa:</strong> el fuego sube hasta las copas de los árboles y avanza a través de
        ellas [20].
      </li>
      <li>
        <strong>Subterráneo:</strong> el fuego avanza bajo el suelo, quemando raíces y materia
        orgánica acumulada [19].
      </li>
    </ul>

    <h2>Cómo afectan al ambiente</h2>
    <p>
      Los incendios forestales tienen efectos sobre la salud de las personas, sus medios de vida, la
      calidad del aire y del agua, y la biodiversidad [21].
    </p>
    <ul>
      <li>
        <strong>Suelo:</strong> cuando la vegetación se quema, el suelo queda desprotegido frente a la
        lluvia y el viento y se erosiona [22].
      </li>
      <li>
        <strong>Agua:</strong> con el tiempo, las cenizas y los restos del incendio pueden contaminar
        fuentes de agua potable [23].
      </li>
      <li>
        <strong>Aire y salud:</strong> el contaminante principal del humo son las partículas finas,
        que pueden llegar a lo profundo de los pulmones y afectar los pulmones y el corazón [24]. El
        viento lleva el humo a comunidades cercanas e incluso a países vecinos [25], por eso un
        incendio en un país puede afectar el aire de otro.
      </li>
      <li>
        <strong>No todos los ecosistemas responden igual.</strong> En la sabana del Cerrado
        brasileño, el fuego es un componente natural, y sus árboles producen tres veces más corteza
        que las especies de selva, lo que les permite sobrevivir y rebrotar [26][27]. La Amazonía, en
        cambio, tiene vegetación que no está adaptada al fuego [26]. En los bosques
        andino-patagónicos, la lenga se recupera muy mal y puede tardar siglos o no volver, mientras
        que los matorrales suelen rebrotar bien [28]. En el cerro Carbón, cerca de Bariloche, había un
        bosque de lenga que se quemó a comienzos de la década de 1950, y hoy es estepa [29].
      </li>
    </ul>

    <h2>Prevención</h2>
    <p>
      La gran mayoría de los incendios forestales de la región los provocan las personas. En
      Argentina, el 95 % de los incendios forestales tiene origen humano, sobre todo fogatas y colillas
      mal apagadas, abandono de tierras y quemas para preparar zonas de pastoreo [6]. En Chile, según
      la Corporación Nacional Forestal (CONAF), el 99,7 % ocurre por acción humana, y solo el 1 % se
      debe a causas naturales [7]. En Uruguay, más del 90 % de los incendios son provocados por el
      accionar humano [8]. Por eso la prevención depende, sobre todo, de las personas.
    </p>
    <p>Recomendaciones del Servicio Nacional de Manejo del Fuego de Argentina [30]:</p>
    <ul>
      <li>Hacer fuego solo en lugares habilitados, nunca debajo de los árboles, y no perderlo de vista.</li>
      <li>Tener siempre a mano recipientes con abundante agua.</li>
      <li>Para apagarlo, usar abundante agua, remover las cenizas para comprobar que no queden brasas y asegurarse de que los restos queden fríos.</li>
      <li>Controlar que el viento no arrastre chispas hacia árboles y pastizales.</li>
      <li>No tirar colillas ni fósforos encendidos al suelo en zonas rurales y áreas protegidas.</li>
      <li>Llevarse la basura: las latas y los vidrios pueden actuar como lupa y provocar incendios.</li>
      <li>Si vivís cerca de un bosque o en el campo, mantener los alrededores de la vivienda libres de arbustos y desechos.</li>
    </ul>
    <p>
      En las áreas protegidas, conviene además consultar el índice de peligrosidad de incendios antes
      de usar fuego [31]. Si ves fuego o una columna de humo, avisá al personal del área o llamá al
      número de emergencias de tu país.
    </p>
  </div>
</template>
