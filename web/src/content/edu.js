/**
 * Tarjetas de EduAustralis, en español y en inglés. `at` es cuánto de la trayectoria (0..1) tiene que
 * recorrer el cohete para que aparezca la tarjeta; `side`, la columna junto al mapa. `body` es HTML
 * estático de confianza. Los emoji son los que Windows 10 dibuja (nada posterior a Emoji 12).
 */
const cards = [
  { id: 1, at: 0.12, side: 'right' },
  { id: 2, at: 0.32, side: 'right' },
  { id: 3, at: 0.52, side: 'right' },
  { id: 4, at: 0.7, side: 'left' },
  { id: 5, at: 0.88, side: 'left' },
];

const text = {
  es: {
    1: {
      title: '¿Qué muestra este mapa? 🤔',
      body: `
        <p>🛰️ Hay satélites que dan vueltas alrededor de la Tierra y sacan algo así como "fotos de calor". Cuando ven un lugar muy caliente, como un fuego, lo marcan con un puntito.</p>
        <p>Este mapa junta los puntitos de muchos años en seis países: Argentina, Chile, Uruguay, Paraguay, Bolivia y Brasil. Así podemos ver dónde y cuándo hubo fuego.</p>`,
    },
    2: {
      title: '¿Para qué sirve? 🧐',
      body: `
        <p>Podemos saber en qué meses hay más fuego y si un año tuvo más o menos que lo normal. No en todos lados pasa en la misma época: en gran parte de Sudamérica los incendios aparecen entre julio y octubre, cuando casi no llueve, y en el sur de Argentina, de diciembre a marzo, en pleno verano. Saberlo ayuda a los brigadistas y guardaparques a estar listos en el momento justo 🚒.</p>
        <p>Un puntito quiere decir "acá el satélite vio algo muy caliente". No siempre es un incendio grande. Y si hay nubes, a veces el satélite no ve nada.</p>`,
    },
    3: {
      title: 'Tipos de incendios 🔥',
      body: `
        <p>Los incendios que pasan en la naturaleza pueden avanzar de tres maneras:</p>
        <ul>
          <li>🌾 <strong>El que corre por el piso:</strong> quema pasto, hojas y ramitas.</li>
          <li>🌲 <strong>El que salta a los árboles:</strong> sube hasta las copas y avanza por arriba.</li>
          <li>🕳️ <strong>El que se esconde abajo:</strong> arde bajo la tierra, quemando raíces.</li>
        </ul>`,
    },
    4: {
      title: '¿Qué pasa después de un incendio? 🌱',
      body: `
        <ul>
          <li>🐆 Muchos animales pierden su casa. En 2020, los incendios del Pantanal, en Brasil, afectaron a casi la mitad de los yaguaretés que viven ahí.</li>
          <li>💨 El humo tiene partículas tan chiquitas que se meten hasta el fondo de los pulmones. Y el viento lo puede llevar hasta otros países.</li>
          <li>🌧️ El suelo queda pelado y la lluvia y el viento se lo llevan.</li>
          <li>🌳 Algunas plantas aguantan el fuego y vuelven a crecer rápido, como las del Cerrado de Brasil, que tienen una corteza muy gruesa. Otras no: la lenga, un árbol de la cordillera, puede tardar siglos en volver, y a veces no vuelve nunca.</li>
        </ul>`,
    },
    5: {
      title: '¿Cómo podemos cuidarnos? 🧯',
      body: `
        <p>¿Sabías que casi todos los incendios forestales empiezan por algo que hizo una persona? Eso quiere decir que entre todos podemos evitarlos.</p>
        <ul>
          <li>🚫 <strong>Fósforos y encendedores no son juguetes.</strong> Si encontrás uno, dáselo a un adulto.</li>
          <li>💧 <strong>Fogón bien apagado.</strong> En un campamento, ayudá a echar mucha agua hasta que las cenizas estén frías.</li>
          <li>🗑️ <strong>Llevate tu basura.</strong> Las latas y los vidrios pueden hacer de lupa con el sol y empezar un fuego.</li>
          <li>📞 <strong>Si ves humo, avisá.</strong> Contale enseguida a un adulto para que llame a emergencias.</li>
        </ul>`,
    },
  },
  en: {
    1: {
      title: 'What does this map show? 🤔',
      body: `
        <p>🛰️ Some satellites circle the Earth and take something like "heat photos". When they see a very hot spot, like a fire, they mark it with a little dot.</p>
        <p>This map puts together the dots from many years in six countries: Argentina, Chile, Uruguay, Paraguay, Bolivia and Brazil. That way we can see where and when there was fire.</p>`,
    },
    2: {
      title: 'What is it for? 🧐',
      body: `
        <p>We can find out which months have the most fire, and whether a year had more or less than usual. It doesn't happen at the same time everywhere: in most of South America fires show up between July and October, when it hardly rains, and in southern Argentina from December to March, in the middle of summer. Knowing this helps firefighters and park rangers be ready at the right moment 🚒.</p>
        <p>A dot means "the satellite saw something very hot here". It isn't always a big fire. And when there are clouds, sometimes the satellite can't see anything.</p>`,
    },
    3: {
      title: 'Types of fires 🔥',
      body: `
        <p>Fires in nature can spread in three ways:</p>
        <ul>
          <li>🌾 <strong>The one that runs along the ground:</strong> it burns grass, leaves and twigs.</li>
          <li>🌲 <strong>The one that jumps to the trees:</strong> it climbs to the treetops and moves along the top.</li>
          <li>🕳️ <strong>The one that hides underground:</strong> it burns below the soil, through the roots.</li>
        </ul>`,
    },
    4: {
      title: 'What happens after a fire? 🌱',
      body: `
        <ul>
          <li>🐆 Many animals lose their home. In 2020, the fires in the Pantanal, in Brazil, affected almost half of the jaguars that live there.</li>
          <li>💨 Smoke has particles so tiny they get deep into the lungs. And the wind can carry it all the way to other countries.</li>
          <li>🌧️ The ground is left bare, and the rain and wind wash it away.</li>
          <li>🌳 Some plants can stand the fire and grow back quickly, like those of Brazil's Cerrado, which have very thick bark. Others can't: the lenga, a tree from the Andes, can take centuries to come back, and sometimes it never does.</li>
        </ul>`,
    },
    5: {
      title: 'How can we stay safe? 🧯',
      body: `
        <p>Did you know that almost every wildfire starts with something a person did? That means that together we can prevent them.</p>
        <ul>
          <li>🚫 <strong>Matches and lighters are not toys.</strong> If you find one, give it to an adult.</li>
          <li>💧 <strong>Put the campfire out properly.</strong> When camping, help pour lots of water until the ashes are cold.</li>
          <li>🗑️ <strong>Take your trash with you.</strong> Cans and glass can work like a magnifying glass in the sun and start a fire.</li>
          <li>📞 <strong>If you see smoke, tell someone.</strong> Tell an adult right away so they can call emergency services.</li>
        </ul>`,
    },
  },
};

/** Las tarjetas en el idioma pedido (español si no está). */
export function eduCards(locale) {
  const t = text[locale] ?? text.es;
  return cards.map((c) => ({ ...c, ...t[c.id] }));
}
