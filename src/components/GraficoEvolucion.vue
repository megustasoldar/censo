<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import evolucion from 'virtual:evolucion'
import { CENSOS } from '../lib/censo'

// Evolución anual (censo a 1 de septiembre) del total, CERE y CERA. Cada serie va en su propio
// panel con su propia escala: el CERA es ~7 % del CERE y en un eje común quedaría plano.

const TODAS = ''
const provincia = ref(TODAS)
const provincias = [...evolucion].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

const ANIOS = [...new Set(evolucion.flatMap((p) => Object.keys(p.valores).map((k) => k.split(':')[1])))].sort()

const SERIES = [
  { id: 'total', titulo: 'Total (CERE + CERA)', color: 'var(--serie-total)' },
  ...CENSOS.map((c) => ({ id: c.id, titulo: c.prefijo, color: `var(--serie-${c.id})` })),
]

// { total: [v2016, v2017, ...], cer: [...], cera: [...] } para la selección actual
const valores = computed(() => {
  const sel = provincia.value === TODAS ? evolucion : evolucion.filter((p) => p.cod === provincia.value)
  const suma = (id, a) => sel.reduce((s, p) => s + (p.valores[`${id}:${a}`] || 0), 0)
  const res = {}
  for (const c of CENSOS) res[c.id] = ANIOS.map((a) => suma(c.id, a))
  res.total = ANIOS.map((_, i) => CENSOS.reduce((s, c) => s + res[c.id][i], 0))
  return res
})

// Dimensiones: el ancho se mide (ResizeObserver) para que el texto no se escale
const ALTO = 200
const M = { arriba: 12, derecha: 14, abajo: 26, izquierda: 52 }
const ancho = ref(320)
const contenedor = ref(null)
let observador
onMounted(() => {
  observador = new ResizeObserver(([e]) => {
    const primero = e.target.querySelector('.grafico__svg')
    if (primero) ancho.value = Math.max(240, primero.clientWidth)
  })
  observador.observe(contenedor.value)
})
onBeforeUnmount(() => observador?.disconnect())

const x = (i) => M.izquierda + (i * (ancho.value - M.izquierda - M.derecha)) / (ANIOS.length - 1)

// Escala "bonita" para el eje Y (no empieza en 0: es una línea y lo que importa es la evolución)
function escala(serie) {
  let min = Math.min(...serie), max = Math.max(...serie)
  if (min === max) { min -= 1; max += 1 }
  const bruto = (max - min) / 4
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((p) => p >= bruto)
  const ini = Math.floor(min / paso) * paso
  const fin = Math.ceil(max / paso) * paso
  const marcas = []
  for (let v = ini; v <= fin + paso / 2; v += paso) marcas.push(v)
  const y = (v) => M.arriba + ((fin - v) / (fin - ini)) * (ALTO - M.arriba - M.abajo)
  return { marcas, y }
}

const paneles = computed(() => SERIES.map((s) => {
  const serie = valores.value[s.id]
  const { marcas, y } = escala(serie)
  const puntos = serie.map((v, i) => [x(i), y(v)])
  return {
    ...s,
    serie,
    marcas: marcas.map((v) => ({ v, y: y(v) })),
    puntos,
    linea: puntos.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(''),
  }
}))

// Año resaltado (hover / teclado), compartido por los tres paneles; por defecto el último
const activo = ref(null)
const iActivo = computed(() => activo.value ?? ANIOS.length - 1)

function mover(ev) {
  const r = ev.currentTarget.getBoundingClientRect()
  const px = ((ev.clientX - r.left) / r.width) * ancho.value
  const paso = (ancho.value - M.izquierda - M.derecha) / (ANIOS.length - 1)
  activo.value = Math.min(ANIOS.length - 1, Math.max(0, Math.round((px - M.izquierda) / paso)))
}
function teclado(ev) {
  const d = { ArrowLeft: -1, ArrowRight: 1 }[ev.key]
  if (!d) return
  ev.preventDefault()
  activo.value = Math.min(ANIOS.length - 1, Math.max(0, iActivo.value + d))
}

const fmt = new Intl.NumberFormat('es-ES', { useGrouping: 'always' })
const fmtEje = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 2 })
const fmtDif = new Intl.NumberFormat('es-ES', { useGrouping: 'always', signDisplay: 'exceptZero' })
const fmtPct = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })

// Variación del año activo respecto al primero
function variacion(serie) {
  const a = serie[0], b = serie[iActivo.value]
  if (!iActivo.value || !a) return null
  return { dif: b - a, pct: ((b - a) / a) * 100 }
}
</script>

<template>
  <section class="grafico">
    <div class="grafico__cabecera">
      <h3>Evolución del censo electoral ({{ ANIOS[0] }}–{{ ANIOS.at(-1) }})</h3>
      <label class="campo">
        Provincia
        <select v-model="provincia">
          <option :value="TODAS">Todas las provincias</option>
          <option v-for="p in provincias" :key="p.cod" :value="p.cod">{{ p.nombre }}</option>
        </select>
      </label>
    </div>

    <div ref="contenedor" class="grafico__paneles">
      <figure v-for="p in paneles" :key="p.id" class="grafico__panel">
        <figcaption>
          <span class="grafico__serie"><span class="grafico__clave" :style="{ background: p.color }" />{{ p.titulo }}</span>
          <strong class="grafico__valor">{{ fmt.format(p.serie[iActivo]) }}</strong>
          <span class="muted">
            {{ ANIOS[iActivo] }}
            <template v-if="variacion(p.serie)">
              · {{ fmtDif.format(variacion(p.serie).dif) }} ({{ fmtPct.format(variacion(p.serie).pct) }} %) desde {{ ANIOS[0] }}
            </template>
          </span>
        </figcaption>
        <svg
          class="grafico__svg"
          :viewBox="`0 0 ${ancho} ${ALTO}`"
          :height="ALTO"
          tabindex="0"
          role="img"
          :aria-label="`${p.titulo}: evolución ${ANIOS[0]}–${ANIOS.at(-1)}. Flechas izquierda/derecha para recorrer los años.`"
          @pointermove="mover"
          @pointerleave="activo = null"
          @keydown="teclado"
          @blur="activo = null"
        >
          <g class="grafico__eje">
            <template v-for="m in p.marcas" :key="m.v">
              <line :x1="M.izquierda" :x2="ancho - M.derecha" :y1="m.y" :y2="m.y" />
              <text :x="M.izquierda - 6" :y="m.y" text-anchor="end" dominant-baseline="middle">{{ fmtEje.format(m.v) }}</text>
            </template>
            <text
              v-for="(a, i) in ANIOS"
              :key="a"
              :x="x(i)"
              :y="ALTO - 8"
              text-anchor="middle"
              :class="{ 'grafico__anio--on': i === iActivo }"
            >{{ i % 2 === 0 || i === iActivo ? a : '' }}</text>
          </g>
          <line class="grafico__cursor" :x1="x(iActivo)" :x2="x(iActivo)" :y1="M.arriba" :y2="ALTO - M.abajo" />
          <path :d="p.linea" class="grafico__linea" :style="{ stroke: p.color }" />
          <circle
            :cx="p.puntos[iActivo][0]"
            :cy="p.puntos[iActivo][1]"
            r="5"
            class="grafico__punto"
            :style="{ fill: p.color }"
          />
        </svg>
      </figure>
    </div>

    <details class="grafico__tabla">
      <summary>Ver datos en tabla</summary>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Año</th>
              <th v-for="p in paneles" :key="p.id" class="num">{{ p.titulo }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(a, i) in ANIOS" :key="a">
              <td>{{ a }}</td>
              <td v-for="p in paneles" :key="p.id" class="num">{{ fmt.format(p.serie[i]) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>

<style scoped lang="scss">
@use '../styles/vars' as *;

.grafico {
  h3 { margin: 0; font-size: 1.15rem; }

  &__cabecera {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .campo {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }

  &__paneles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }

  &__panel {
    margin: 0;
    border: 1px solid var(--border);
    border-radius: $radius;
    padding: 10px 10px 4px;
    min-width: 0;

    figcaption {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-inline: 4px;
      font-size: 12px;
    }
  }

  &__serie {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
    color: var(--fg);
  }

  // Clave de línea (no caja): las series son líneas
  &__clave {
    width: 14px;
    height: 2px;
    border-radius: 1px;
  }

  &__valor {
    font-size: 1.4rem;
    color: var(--fg);
  }

  &__svg {
    display: block;
    width: 100%;
    overflow: visible;
    touch-action: pan-y;
    font-variant-numeric: tabular-nums;

    &:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
  }

  &__eje {
    line { stroke: var(--border); stroke-width: 1; }
    text { fill: var(--muted); font-size: 11px; }
  }

  &__anio--on { fill: var(--fg) !important; font-weight: 700; }

  &__cursor { stroke: var(--muted); stroke-width: 1; opacity: 0.5; }

  &__linea {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  &__punto {
    stroke: var(--panel);
    stroke-width: 2;
  }

  &__tabla {
    margin-top: 12px;

    summary { cursor: pointer; color: var(--accent); }

    .tabla-wrap { overflow-x: auto; margin-top: 8px; }

    table {
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }

    th, td {
      padding: 4px 10px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      white-space: nowrap;
    }

    .num { text-align: right; }
  }
}
</style>
