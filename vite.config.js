import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { agregarProvincias, cargarCSV, crearDatos, infoFichero } from './src/lib/censo.js'

// Módulo virtual "virtual:evolucion": totales de septiembre por provincia y año, calculados al
// compilar a partir de todos los CSV de src/data. Así el gráfico de Inicio no descarga los CSV.
//   export default [{ cod: '02', nombre: 'ALBACETE', valores: { 'cer:2016': 302480, 'cera:2016': 6891, ... } }, ...]
function evolucionCenso() {
  const id = 'virtual:evolucion'
  const idResuelto = '\0' + id
  const dir = path.resolve('src/data')
  return {
    name: 'evolucion-censo',
    resolveId: (s) => (s === id ? idResuelto : null),
    load(s) {
      if (s !== idResuelto) return
      const datos = crearDatos()
      for (const f of fs.readdirSync(dir)) {
        const info = infoFichero(f)
        if (!info) continue
        const ruta = path.join(dir, f)
        this.addWatchFile(ruta)
        cargarCSV(datos, fs.readFileSync(ruta, 'utf8'), info.censo)
      }
      const provincias = agregarProvincias(datos).map(({ prov, nombre, valores }) => ({ cod: prov, nombre, valores }))
      return `export default ${JSON.stringify(provincias)}`
    },
  }
}

export default defineConfig({
  // Rutas relativas para que funcione en GitHub Pages (https://usuario.github.io/repo/)
  base: './',
  plugins: [vue(), evolucionCenso()],
  // Los CSV del censo se empaquetan como chunks grandes; es esperado.
  build: { chunkSizeWarningLimit: 1500 },
})
