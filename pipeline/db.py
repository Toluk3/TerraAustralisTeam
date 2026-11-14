"""Conexión a DuckDB, extensiones y vistas sobre los Parquet (§1)."""
from __future__ import annotations

import logging
import shutil
from importlib import resources
from pathlib import Path

import duckdb

from .config import Config

log = logging.getLogger(__name__)

VIEW_NAMES = {"raw": "fires_raw", "norm": "fires_norm", "excluded": "fires_excluded"}


def connect(cfg: Config, read_only: bool = False) -> duckdb.DuckDBPyConnection:
    """Abre data/prehack.duckdb. El pipeline es el único que escribe; la app usa read_only=True."""
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(cfg.db_path), read_only=read_only)
    con.execute("SET TimeZone = 'UTC'")
    _load_h3(con)
    if not read_only:
        con.execute(resources.files("pipeline").joinpath("schema.sql").read_text(encoding="utf-8"))
        refresh_views(cfg, con)
    return con


def _load_h3(con: duckdb.DuckDBPyConnection) -> None:
    """Extensión h3 de la comunidad; si no instala, UDF con h3 v4 de Python (§1)."""
    try:
        try:
            con.execute("LOAD h3")
        except duckdb.Error:
            con.execute("INSTALL h3 FROM community")
            con.execute("LOAD h3")
        con.execute("CREATE OR REPLACE TEMP MACRO h3_cell(lat, lon, res) AS h3_latlng_to_cell(lat, lon, res)")
        con.execute("CREATE OR REPLACE TEMP MACRO h3_parent(c, res) AS h3_cell_to_parent(c, res)")
        con.execute("CREATE OR REPLACE TEMP MACRO h3_ring1(c) AS h3_grid_disk(c, 1)")
        return
    except duckdb.Error as e:  # pragma: no cover - depende de la red
        log.warning("Extensión h3 no disponible (%s); se usa h3 de Python", e)
    import h3
    from duckdb import sqltypes as T

    con.create_function("h3_cell", lambda lat, lon, res: h3.str_to_int(h3.latlng_to_cell(lat, lon, res)),
                        [T.DOUBLE, T.DOUBLE, T.INTEGER], T.UBIGINT)
    con.create_function("h3_parent", lambda c, res: h3.str_to_int(h3.cell_to_parent(h3.int_to_str(c), res)),
                        [T.UBIGINT, T.INTEGER], T.UBIGINT)
    con.create_function("h3_ring1", lambda c: [h3.str_to_int(x) for x in h3.grid_disk(h3.int_to_str(c), 1)],
                        [T.UBIGINT], duckdb.list_type(T.UBIGINT))


def load_spatial(con) -> None:
    try:
        con.execute("LOAD spatial")
    except duckdb.Error:
        con.execute("INSTALL spatial")
        con.execute("LOAD spatial")
    try:  # DuckDB 2.x: coordenadas en orden (lon, lat), como GeoJSON
        con.execute("SET geometry_always_xy = true")
    except duckdb.Error:
        pass


def has_parquet(cfg: Config, table: str, sensor: str | None = None) -> bool:
    base = cfg.parquet_dir(table)
    if sensor:
        base = base / f"sensor={sensor}"
    return base.exists() and any(base.rglob("*.parquet"))


def read_parquet_sql(cfg: Config, table: str, sensor: str | None = None) -> str:
    base = cfg.parquet_dir(table)
    glob = base / f"sensor={sensor}" / "**" / "*.parquet" if sensor else base / "**" / "*.parquet"
    return (f"read_parquet('{glob}', hive_partitioning = true, union_by_name = true, "
            f"hive_types = {{'year': INTEGER, 'sensor': VARCHAR}})")


def refresh_views(cfg: Config, con) -> None:
    """Vistas fires_raw / fires_norm / fires_excluded sobre los Parquet particionados."""
    for table, view in VIEW_NAMES.items():
        if has_parquet(cfg, table):
            con.execute(f"CREATE OR REPLACE VIEW {view} AS SELECT * FROM {read_parquet_sql(cfg, table)}")
        else:
            con.execute(f"DROP VIEW IF EXISTS {view}")


def require_view(con, view: str) -> None:
    if not con.execute("SELECT count(*) FROM duckdb_views() WHERE view_name = ?", [view]).fetchone()[0]:
        raise RuntimeError(f"No existe {view}: correr antes los pasos anteriores del pipeline")


def reset_dir(path: Path) -> None:
    """Idempotencia: se borra la carpeta de la partición antes de escribirla (§1)."""
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def sql_in(values) -> str:
    return ", ".join(f"'{v}'" for v in values)
