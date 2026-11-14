# CU-08 — Publicar los resultados en Cloud Storage

**Actor:** equipo de datos o de back.
**Objetivo:** subir las tablas finales al bucket que lee el backend (ARQUITECTURA.md §4.2).

## Precondiciones

- CU-03 hecho y validación revisada (CU-06).
- Google Cloud SDK instalado y con sesión iniciada (`gcloud auth login`), y permiso de escritura en el bucket. Las credenciales nunca van en el repo (ARQUITECTURA.md §8).

## Flujo principal

1. Regenerar la carpeta de publicación (la borra y la vuelve a escribir entera):
   ```bash
   .venv/bin/python -m pipeline export
   ```
2. Revisar `data/publish/meta/version.json`: `config_hash`, `metric`, `switch_date`, cobertura y meses con cobertura reducida.
3. Subir:
   ```bash
   gcloud storage rsync -r --delete-unmatched-destination-objects data/publish gs://<bucket>
   ```
   `rsync` con borrado deja el bucket idéntico a la carpeta local, sin archivos viejos de una corrida anterior.

## Resultado

```
gs://<bucket>/
├── series/res=7/part-0.parquet          9,6 MB   serie mensual por celda (toda Argentina)
├── calibration/k.parquet, boot.parquet   29 MB   k por estrato y réplicas bootstrap
├── map/res=5|6|7/part-0.parquet         180 KB   valor armonizado y anomalía por celda de la zona
├── points/year=*/h3_r3=*/               7,2 MB   165.107 focos limpios de la zona
├── zone/                                 64 KB   contorno, calendario, mediana, línea de tiempo de 8 días
├── reportes/                             88 KB   CSV de validación y QC (no los usa la app)
└── meta/version.json
```

`reportes/` es para el equipo y la presentación. Si el bucket solo debe tener lo que usa la app, se puede excluir con `--exclude "reportes/.*"`.

## Notas

- El backend copia `series/`, `calibration/` y `map/` a disco al arrancar y lee `points/` con `httpfs` (ARQUITECTURA.md §4.3).
- `points/` tiene la columna `sensor` solo para el detalle al pasar el mouse. Los valores que muestra la app salen siempre de `n_equiv`.
- `meta/version.json` lleva la atribución de FIRMS, que hay que mostrar en la app.
