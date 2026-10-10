// Parseo y agregación de los ficheros de la Oficina del Censo Electoral:
//   cermun_*.csv  -> CER  (españoles residentes en España), mostrado como "CERE"
//   ceramun_*.csv -> CERA (españoles residentes en el extranjero)
//
// Estructura de datos:
//   municipios: Map<"PP-MMM", { prov, cod, nombre, valores: { "cer:2023": 35193, "cera:2026": 812, ... } }>
//   provincias: Map<"PP", nombre>

// De cada fichero (un año) solo se usa el censo cerrado a 1 de septiembre
export const MES = '09'

// Años comparados por defecto
export const ANIOS_DEFECTO = ['2023', '2026']

// El censo de cada fichero se detecta por su nombre (cermun_AA.csv / ceramun_AA.csv): el título
// interno no es fiable (p. ej. ceramun_24.csv dice "(CER)").
export const CENSOS = [
  { id: 'cer', prefijo: 'CERE', fichero: 'cermun' },
  { id: 'cera', prefijo: 'CERA', fichero: 'ceramun' },
]

const MESES_ES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 }

// "./data/ceramun_23.csv" -> { censo: 'cera', anio: '2023' }
export function infoFichero(ruta) {
  const m = /(cera?mun)_(\d{2})\.csv$/.exec(ruta)
  const censo = m && CENSOS.find((c) => c.fichero === m[1])
  return censo ? { censo: censo.id, anio: `20${m[2]}` } : null
}

export function crearDatos() {
  return { municipios: new Map(), provincias: new Map() }
}

export function parseCSV(texto) {
  const filas = []
  let fila = [], campo = '', comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else comillas = false
      } else campo += c
    } else if (c === '"') comillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); filas.push(fila); fila = []; campo = ''
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }
  return filas
}

// "Censo cerrado a 1-dic-2023" -> "2023-12"
export function parseMes(cabecera) {
  const m = /(\d{1,2})-([a-z]{3})-(\d{4})/i.exec(cabecera || '')
  if (!m) return null
  const mes = MESES_ES[m[2].toLowerCase()]
  return mes ? `${m[3]}-${String(mes).padStart(2, '0')}` : null
}

// "1,234" -> 1234; vacío o "-" (sin datos ese mes) -> null
function parseNum(s) {
  const limpio = (s || '').replace(/[.,\s]/g, '')
  return /^\d+$/.test(limpio) ? Number(limpio) : null
}

// Añade el contenido de un CSV del censo `censoId` ('cer' | 'cera') a `datos`.
export function cargarCSV(datos, texto, censoId) {
  const filas = parseCSV(texto.replace(/^﻿/, ''))
  const iCab = filas.findIndex((f) => f.some((c) => /censo cerrado/i.test(c)))
  if (iCab < 0) throw new Error('no se encuentra la cabecera "Censo cerrado a ..."')

  // En los ficheros antiguos la cabecera ocupa dos filas: "Censo cerrado" / "a 1-sep-2016"
  const cabecera = filas[iCab].map((c, i) => (parseMes(c) ? c : `${c} ${filas[iCab + 1]?.[i] || ''}`))

  // índice de columna -> clave "censo:YYYY" (solo el mes usado)
  const columnas = cabecera.map((c) => {
    const mes = parseMes(c)
    return mes?.endsWith(`-${MES}`) ? `${censoId}:${mes.slice(0, 4)}` : null
  })

  let ultimoTotal = null
  for (const f of filas.slice(iCab + 1)) {
    const [prov, cod, nombre] = f
    const total = /^Total (.+)$/i.exec(prov || '')
    if (total) {
      if (!/^(general|nacional)$/i.test(total[1].trim())) ultimoTotal = total[1].trim()
      continue
    }
    if (!/^\d{2}$/.test(prov) || !/^\d{3}$/.test(cod)) continue

    // La fila "Total X" precede a los municipios de su provincia
    if (ultimoTotal) {
      if (!datos.provincias.has(prov)) datos.provincias.set(prov, ultimoTotal)
      ultimoTotal = null
    }

    const clave = `${prov}-${cod}`
    let muni = datos.municipios.get(clave)
    if (!muni) {
      muni = { prov, cod, nombre: nombre.trim(), valores: {} }
      datos.municipios.set(clave, muni)
    }
    columnas.forEach((col, i) => {
      if (!col) return
      const v = parseNum(f[i])
      if (v !== null) muni.valores[col] = v
    })
  }
}

// Suma los municipios por provincia, con la misma forma que un municipio.
export function agregarProvincias(datos) {
  const agg = new Map()
  for (const m of datos.municipios.values()) {
    let p = agg.get(m.prov)
    if (!p) {
      p = { prov: m.prov, cod: '', nombre: datos.provincias.get(m.prov) || m.prov, valores: {} }
      agg.set(m.prov, p)
    }
    for (const [k, v] of Object.entries(m.valores)) p.valores[k] = (p.valores[k] || 0) + v
  }
  return [...agg.values()]
}

// Columnas de datos de la tabla para los años [inicial, final]: primero los valores de cada año
// (censos juntos), después los Δ absolutos, los Δ % y al final el Δ y Δ % de todos los censos sumados.
export function columnasDatos(anios) {
  const primero = anios[0], ultimo = anios.at(-1)
  const p = (prefijo) => (prefijo ? `${prefijo} ` : '')
  // `de`: [claves que suman el valor inicial, claves que suman el valor final]
  const de = (ids) => [ids.map((id) => `${id}:${primero}`), ids.map((id) => `${id}:${ultimo}`)]
  const todos = CENSOS.map((c) => c.id)
  const nombreTodos = CENSOS.map((c) => c.prefijo || c.id.toUpperCase()).join(' + ')
  return [
    ...anios.flatMap((a) => CENSOS.map(({ id, prefijo }) =>
      ({ id: `${id}:${a}`, t: `${p(prefijo)}${a}`, tipo: 'num' }))),
    ...CENSOS.map(({ id, prefijo }) =>
      ({ id: `${id}:dif`, t: `${p(prefijo)}Δ`, tipo: 'dif', de: de([id]) })),
    ...CENSOS.map(({ id, prefijo }) =>
      ({ id: `${id}:pct`, t: `${p(prefijo)}Δ %`, tipo: 'pct', de: de([id]) })),
    { id: 'total:dif', t: `${nombreTodos} Δ`, tipo: 'dif', de: de(todos) },
    { id: 'total:pct', t: `${nombreTodos} Δ %`, tipo: 'pct', de: de(todos) },
  ]
}

// Suma de varias claves de `valores`; null si falta alguna
function sumar(valores, claves) {
  let s = 0
  for (const k of claves) {
    if (valores[k] == null) return null
    s += valores[k]
  }
  return s
}

// Valores de todas las columnas de datos a partir de `valores` (incluye Δ y Δ %)
export function calcularCeldas(valores, columnas) {
  const celdas = {}
  for (const c of columnas) {
    if (c.tipo === 'num') { celdas[c.id] = valores[c.id] ?? null; continue }
    const [a, b] = c.de.map((claves) => sumar(valores, claves))
    const dif = a != null && b != null ? b - a : null
    celdas[c.id] = c.tipo === 'dif' ? dif : dif != null && a ? (dif / a) * 100 : null
  }
  return celdas
}
