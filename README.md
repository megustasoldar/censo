# Comparador del censo electoral

Aplicación web (Vue 3 + Vite + Sass) para comparar el número de electores por municipio
a partir de los ficheros `cermun_*.csv` y `ceramun_*.csv` de la Oficina del Censo Electoral.

- Selector de **año inicial** y **año final** (2016–2026, por defecto 2023 y 2026). De cada año se usa
  el censo cerrado a 1 de septiembre del CER (`cermun_AA.csv`, residentes en España) y del CERA
  (`ceramun_AA.csv`, residentes en el extranjero), con los prefijos **CERE** y **CERA**.
- Variación absoluta y porcentual entre ambos años para cada censo.
- Pestaña **INICIO** con la evolución anual (2016–2026) del total, CERE y CERA, filtrable por provincia.
  Los totales por provincia y año se calculan al compilar (módulo virtual `virtual:evolucion` en
  `vite.config.js`), así que esta pestaña no descarga los CSV.
- Pestaña **CENSO MUNICIPIOS** (filtro por provincia y búsqueda por nombre o código INE) y pestaña
  **CENSO PROVINCIAS** con el mismo formato acumulado por provincia. Cada pestaña conserva sus filtros.
- Columnas combinadas **CERE + CERA** con el incremento total y en porcentaje.
- Ordenación por cualquier columna y exportación a CSV (separador `;`, compatible con Excel).

## Desarrollo

```bash
npm install
npm run dev       # servidor de desarrollo
npm run build     # genera dist/
npm run preview   # sirve dist/ localmente
```

## Datos

Los CSV de `src/data/` se incluyen automáticamente y se cargan bajo demanda al seleccionar su año.
El tipo de censo y el año se deducen del nombre del fichero (`cermun_AA.csv` / `ceramun_AA.csv`),
no del título interno (p. ej. `ceramun_24.csv` se titula "(CER)" por error). El mes usado, los años
por defecto y el prefijo de cada censo se configuran en `MES`, `ANIOS_DEFECTO` y `CENSOS` de
`src/lib/censo.js`.

## Publicar en GitHub Pages

El workflow `.github/workflows/deploy.yml` compila y publica `dist/` en cada push a `main`.
En el repositorio: *Settings → Pages → Build and deployment → Source: GitHub Actions*.
