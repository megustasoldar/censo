<script setup>
import { computed, ref, watch } from 'vue'
import { calcularCeldas } from '../lib/censo'

const PAGINA = 500

const props = defineProps({
  filas: { type: Array, required: true },     // [{ prov, cod, nombre, valores, celdas }]
  columnas: { type: Array, required: true },  // columnas de datos: [{ id, t, tipo: 'num' | 'dif' | 'pct' }]
  nivel: { type: String, required: true },    // 'muni' | 'prov'
  provincias: { type: Map, required: true },
})
const orden = defineModel('orden', { type: Object, required: true }) // { col, asc }

const limite = ref(PAGINA)
watch(() => props.filas, () => { limite.value = PAGINA })

const fmt = new Intl.NumberFormat('es-ES', { useGrouping: 'always' })
const fmtDif = new Intl.NumberFormat('es-ES', { useGrouping: 'always', signDisplay: 'exceptZero' })
const fmtPct = new Intl.NumberFormat('es-ES', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' })

const columnasTexto = computed(() => props.nivel === 'prov'
  ? [{ id: 'ine', t: 'Código' }, { id: 'nombre', t: 'Provincia' }]
  : [{ id: 'ine', t: 'INE' }, { id: 'nombre', t: 'Municipio' }, { id: 'prov', t: 'Provincia' }])

const visibles = computed(() => props.filas.slice(0, limite.value))

const totales = computed(() => {
  const suma = {}
  for (const c of props.columnas) {
    if (c.tipo === 'num') suma[c.id] = props.filas.reduce((s, r) => s + (r.valores[c.id] || 0), 0)
  }
  return calcularCeldas(suma, props.columnas)
})

function ordenarPor(col) {
  const esTexto = ['nombre', 'ine', 'prov'].includes(col)
  orden.value = orden.value.col === col
    ? { col, asc: !orden.value.asc }
    : { col, asc: esTexto }
}

function formatear(v, tipo) {
  if (v == null) return '—'
  if (tipo === 'dif') return fmtDif.format(v)
  if (tipo === 'pct') return `${fmtPct.format(v)} %`
  return fmt.format(v)
}

function clase(v, tipo) {
  if (v == null) return 'nd'
  if (tipo === 'num') return ''
  return v > 0 ? 'pos' : v < 0 ? 'neg' : ''
}
</script>

<template>
  <div class="tabla-wrap">
    <table class="tabla">
      <thead>
        <tr>
          <th
            v-for="c in [...columnasTexto, ...columnas]"
            :key="c.id"
            :class="{ num: c.tipo, sorted: c.id === orden.col, asc: c.id === orden.col && orden.asc }"
            @click="ordenarPor(c.id)"
          >
            {{ c.t }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in visibles" :key="r.prov + r.cod">
          <template v-if="nivel === 'prov'">
            <td>{{ r.prov }}</td>
            <td>{{ r.nombre }}</td>
          </template>
          <template v-else>
            <td>{{ r.prov }}{{ r.cod }}</td>
            <td>{{ r.nombre }}</td>
            <td>{{ provincias.get(r.prov) || r.prov }}</td>
          </template>
          <td v-for="c in columnas" :key="c.id" class="num" :class="clase(r.celdas[c.id], c.tipo)">
            {{ formatear(r.celdas[c.id], c.tipo) }}
          </td>
        </tr>
      </tbody>
      <tfoot v-if="filas.length">
        <tr>
          <td :colspan="columnasTexto.length">Total ({{ fmt.format(filas.length) }} filas)</td>
          <td v-for="c in columnas" :key="c.id" class="num" :class="clase(totales[c.id], c.tipo)">
            {{ formatear(totales[c.id], c.tipo) }}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
  <p class="resumen muted">
    Mostrando {{ fmt.format(visibles.length) }} de {{ fmt.format(filas.length) }} filas
    <button v-if="filas.length > limite" type="button" class="btn" @click="limite += PAGINA">Mostrar más</button>
  </p>
</template>

<style scoped lang="scss">
@use '../styles/vars' as *;

.tabla-wrap {
  overflow: auto;
  max-height: 70vh;
  border: 1px solid var(--border);
  border-radius: $radius;
  background: var(--panel);
}

.tabla {
  border-collapse: collapse;
  width: 100%;
  font-variant-numeric: tabular-nums;

  th, td {
    padding: 5px 8px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .num { text-align: right; }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--panel);
    text-align: left;
    cursor: pointer;
    user-select: none;
    box-shadow: inset 0 -1px 0 var(--border);

    &.num { text-align: right; }
    &:hover { color: var(--accent); }
    &.sorted::after { content: ' ▼'; font-size: 10px; }
    &.sorted.asc::after { content: ' ▲'; }
  }

  tbody tr:nth-child(even) { background: var(--row-alt); }

  tfoot td {
    position: sticky;
    bottom: 0;
    font-weight: 700;
    background: var(--panel);
    box-shadow: inset 0 1px 0 var(--border);
  }

  .pos { color: var(--pos); }
  .neg { color: var(--neg); }
  .nd { color: var(--muted); }
}

.resumen {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
</style>
