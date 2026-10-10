<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ANIOS_DEFECTO, agregarProvincias, calcularCeldas, cargarCSV, columnasDatos, crearDatos, infoFichero } from './lib/censo'
import TablaCenso from './components/TablaCenso.vue'
import GraficoEvolucion from './components/GraficoEvolucion.vue'

// Todos los CSV de src/data se empaquetan con la aplicación (cada uno en su propio chunk)
// y se cargan bajo demanda al seleccionar sus años.
const ficheros = Object.entries(import.meta.glob('./data/*.csv', { query: '?raw', import: 'default' }))
  .map(([ruta, cargar]) => ({ ...infoFichero(ruta), ruta, cargar }))
  .filter((fi) => fi.censo)
const ANIOS = [...new Set(ficheros.map((fi) => fi.anio))].sort()

// Los datos no son reactivos (miles de objetos); `version` fuerza el recálculo tras la carga.
const datos = crearDatos()
const version = ref(0)
const cargados = new Set() // rutas ya cargadas en `datos`

// Años comparados: [inicial, final]
const anios = reactive({ ini: ANIOS_DEFECTO[0], fin: ANIOS_DEFECTO[1] })
const columnas = computed(() => columnasDatos([anios.ini, anios.fin]))
const cargando = ref(false)

const PESTANAS = [
  { id: 'inicio', titulo: 'INICIO' },
  { id: 'muni', titulo: 'CENSO MUNICIPIOS' },
  { id: 'prov', titulo: 'CENSO PROVINCIAS' },
]
const pestana = ref('inicio')

// Cada pestaña conserva sus propios filtros y orden
const nuevosFiltros = () => ({ provincia: '', busqueda: '', soloCambios: false, ceraMayor: false, orden: { col: 'nombre', asc: true } })
const filtros = reactive({ muni: nuevosFiltros(), prov: nuevosFiltros() })
const f = computed(() => filtros[pestana.value])

const error = ref('')

const listaProvincias = computed(() => {
  version.value
  return [...datos.provincias.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
})

const conCeldas = (filas) => filas.map((m) => ({ ...m, celdas: calcularCeldas(m.valores, columnas.value) }))
const base = {
  muni: computed(() => (version.value, conCeldas([...datos.municipios.values()]))),
  prov: computed(() => (version.value, conCeldas(agregarProvincias(datos)))),
}

const columnasDif = computed(() => columnas.value.filter((c) => c.tipo === 'dif'))

// Filtro "CERA > CERE": se compara en el año final
const ceraMayorQueCere = (m) => m.valores[`cera:${anios.fin}`] > m.valores[`cer:${anios.fin}`]

const filas = computed(() => {
  const { provincia, busqueda, soloCambios, ceraMayor, orden } = f.value
  const q = busqueda.trim().toLowerCase()

  const res = base[pestana.value].value.filter((m) =>
    (!provincia || m.prov === provincia) &&
    (!q || m.nombre.toLowerCase().includes(q) || `${m.prov}${m.cod}`.includes(q)) &&
    (!soloCambios || columnasDif.value.some((c) => m.celdas[c.id])) &&
    (!ceraMayor || ceraMayorQueCere(m))
  )

  const { col, asc } = orden
  const valor = (r) => {
    if (col === 'nombre') return r.nombre
    if (col === 'ine') return `${r.prov}${r.cod}`
    if (col === 'prov') return datos.provincias.get(r.prov) || r.prov
    return r.celdas[col]
  }
  const dir = asc ? 1 : -1
  return res.sort((x, y) => {
    const a = valor(x), b = valor(y)
    if (a == null) return b == null ? 0 : 1
    if (b == null) return -1
    return (typeof a === 'string' ? a.localeCompare(b, 'es') : a - b) * dir
  })
})

// Carga los ficheros de los años seleccionados que aún no estén cargados
watch(() => [anios.ini, anios.fin], async (sel) => {
  const pendientes = ficheros.filter((fi) => sel.includes(fi.anio) && !cargados.has(fi.ruta))
  if (pendientes.length) {
    cargando.value = true
    try {
      const textos = await Promise.all(pendientes.map((fi) => fi.cargar()))
      pendientes.forEach((fi, i) => {
        cargarCSV(datos, textos[i], fi.censo)
        cargados.add(fi.ruta)
      })
    } catch (e) {
      error.value = `Error cargando los datos: ${e.message}`
    }
    cargando.value = false
  }
  // Si se ordenaba por una columna que ya no existe, se vuelve al orden por nombre
  for (const fl of Object.values(filtros)) {
    if (!['nombre', 'ine', 'prov'].includes(fl.orden.col) && !columnas.value.some((c) => c.id === fl.orden.col)) {
      fl.orden = { col: 'nombre', asc: true }
    }
  }
  version.value++
}, { immediate: true })

function exportarCSV() {
  const esProv = pestana.value === 'prov'
  const cab = (esProv ? ['Código', 'Provincia'] : ['INE', 'Municipio', 'Provincia']).concat(columnas.value.map((c) => c.t))
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`
  const lineas = [cab.map(q).join(';')]
  for (const r of filas.value) {
    const c = esProv ? [r.prov, r.nombre] : [`${r.prov}${r.cod}`, r.nombre, datos.provincias.get(r.prov) || r.prov]
    for (const col of columnas.value) {
      const v = r.celdas[col.id]
      c.push(v == null ? '' : col.tipo === 'pct' ? v.toFixed(4).replace('.', ',') : v)
    }
    lineas.push(c.map(q).join(';'))
  }
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `censo_${esProv ? 'provincias' : 'municipios'}_${anios.ini}_${anios.fin}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}
</script>

<template>
  <header class="contenedor">
    <h1>Evolución Censo Electoral</h1>
    <h2>Comparador del censo electoral</h2>
    <p class="muted">
      Electores por lugar de inscripción (censo a 1 de septiembre), {{ anios.ini }} frente a {{ anios.fin }}.
      CERE: residentes en España · CERA: residentes en el extranjero.
    </p>
  </header>

  <main class="contenedor">
    <p v-if="error" class="error">{{ error }}</p>

    <nav class="pestanas" role="tablist">
      <button
        v-for="p in PESTANAS"
        :key="p.id"
        type="button"
        role="tab"
        class="pestanas__tab"
        :class="{ 'pestanas__tab--on': pestana === p.id }"
        :aria-selected="pestana === p.id"
        @click="pestana = p.id"
      >
        {{ p.titulo }}
      </button>
    </nav>

    <section v-if="pestana === 'inicio'" class="panel inicio">
      <p>
        Compara el número de electores inscritos en cada municipio y provincia entre dos años, a partir
        del censo cerrado a 1 de septiembre (2016–2026).
      </p>
      <ul>
        <li><strong>CERE</strong>: españoles residentes en España.</li>
        <li><strong>CERA</strong>: españoles residentes en el extranjero.</li>
      </ul>
      <div class="inicio__acciones">
        <button
          v-for="p in PESTANAS.slice(1)"
          :key="p.id"
          type="button"
          class="btn"
          @click="pestana = p.id"
        >
          {{ p.titulo }}
        </button>
      </div>
    </section>

    <section v-if="pestana === 'inicio'" class="panel">
      <GraficoEvolucion />
    </section>

    <template v-else>
      <section class="panel filtros">
        <label class="campo">
          Año inicial
          <select v-model="anios.ini">
            <option v-for="a in ANIOS" :key="a" :value="a" :disabled="a === anios.fin">{{ a }}</option>
          </select>
        </label>
        <label class="campo">
          Año final
          <select v-model="anios.fin">
            <option v-for="a in ANIOS" :key="a" :value="a" :disabled="a === anios.ini">{{ a }}</option>
          </select>
        </label>
        <label v-if="pestana === 'muni'" class="campo">
          Provincia
          <select v-model="f.provincia">
            <option value="">Todas</option>
            <option v-for="[cod, nombre] in listaProvincias" :key="cod" :value="cod">{{ nombre }}</option>
          </select>
        </label>
        <label class="campo campo--grow">
          {{ pestana === 'muni' ? 'Buscar municipio' : 'Buscar provincia' }}
          <input v-model.trim="f.busqueda" type="search" placeholder="Nombre o código INE…">
        </label>
        <label class="check">
          <input v-model="f.soloCambios" type="checkbox"> Solo con variación
        </label>
        <label v-if="pestana === 'muni'" class="check">
          <input v-model="f.ceraMayor" type="checkbox"> CERA superior a CERE ({{ anios.fin }})
        </label>
        <span v-if="cargando" class="muted">Cargando…</span>
        <button type="button" class="btn" @click="exportarCSV">Exportar CSV</button>
      </section>

      <TablaCenso
        :key="pestana"
        v-model:orden="f.orden"
        :filas="filas"
        :columnas="columnas"
        :nivel="pestana"
        :provincias="datos.provincias"
      />
    </template>
  </main>

  <footer class="contenedor muted pequeno">
    Fuente: Oficina del Censo Electoral (INE), ficheros <code>cermun</code> y <code>ceramun</code>.
  </footer>
</template>

<style scoped lang="scss">
@use './styles/vars' as *;

header { padding-top: 20px; }
h1 {
  margin: 0 0 8px;
  font-family: var(--serif);
  font-size: clamp(2.5rem, 6vw, 5rem);
  font-weight: 400;
  letter-spacing: -.06em;
  line-height: 1;
}
h2 { margin: 0 0 4px; font-size: 1.5rem; }
footer { padding-block: 24px; }

.error { color: var(--neg); }

.pestanas {
  display: flex;
  gap: 4px;
  margin-top: 16px;
  border-bottom: 1px solid var(--border);

  &__tab {
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: $radius $radius 0 0;
    background: none;
    padding: 8px 16px;
    margin-bottom: -1px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--muted);
    cursor: pointer;

    &:hover { color: var(--fg); }

    &--on {
      background: var(--panel);
      border-color: var(--border);
      color: var(--accent);
    }
  }
}

.panel {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: $radius;
  padding: 12px 14px;
  margin-block: 16px;
}

.inicio {
  p { margin-top: 0; }

  &__acciones {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
}

.filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);

  &--grow {
    flex: 1;
    min-width: 180px;
  }
}

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 6px;
}
</style>
