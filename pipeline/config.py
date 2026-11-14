"""Carga de config.yaml y config_hash (PLAN_NORMALIZACION.md §5.3)."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

log = logging.getLogger(__name__)

CONF_ORDER = ["low", "nominal", "high"]
METRICS = ("n_fires", "n_clusters", "n_clusters_r7")
REFERENCES = {"terra_aqua": ["terra", "aqua"], "aqua": ["aqua"]}

# Parámetros que cambian el k: si alguno cambia, el k deja de valer y hay que reajustar.
HASHED_KEYS = [
    "countries", "min_conf_class", "modis_conf_cuts", "t_mir_range_k", "use_static_mask",
    "mask_min_months", "h3", "metric", "reference", "modis_stable_until", "switch_date",
    "terra_fit_to", "viirs_priority", "k_fallback_platform", "month_window",
    "min_source_count", "calibration_levels", "platform_periods",
    # El calendario define qué meses tienen cobertura completa, y eso decide con qué meses se ajusta k.
    "calendar_start", "calendar_end", "calibration_from",
]
LEVEL_RE = re.compile(r"^(global|r\d{1,2})$")


def to_date(v: Any) -> dt.date | None:
    if v is None:
        return None
    if isinstance(v, dt.date):
        return v
    return dt.date.fromisoformat(str(v))


@dataclass
class Config:
    raw: dict
    base_dir: Path
    input_dir: Path = field(init=False)
    data_dir: Path = field(init=False)
    publish_dir: Path = field(init=False)

    def __post_init__(self) -> None:
        p = self.raw["paths"]
        self.input_dir = (self.base_dir / p["input_dir"]).resolve()
        self.data_dir = (self.base_dir / p["data_dir"]).resolve()
        self.publish_dir = (self.base_dir / p["publish_dir"]).resolve()
        if self.raw["min_conf_class"] not in CONF_ORDER:
            raise ValueError(f"min_conf_class inválido: {self.raw['min_conf_class']}")
        if self.raw["metric"] not in METRICS:
            raise ValueError(f"metric inválida: {self.raw['metric']} (opciones: {METRICS})")
        if self.raw["reference"] not in REFERENCES:
            raise ValueError(f"reference inválida: {self.raw['reference']}")
        # La carpeta de entrada depende de cada máquina: se puede fijar sin tocar los YAML.
        if os.environ.get("TERRA_INPUT_DIR"):
            self.input_dir = Path(os.environ["TERRA_INPUT_DIR"]).resolve()
        bad = [lv for lv in self.raw["calibration_levels"] if not LEVEL_RE.match(str(lv))]
        if bad:
            raise ValueError(f"calibration_levels inválidos: {bad} (se espera r<resolución H3> o global)")
        if self.raw["min_conf_class"] == "high":
            # De noche VIIRS casi no marca 'high' (≈1,6 %) y MODIS sí (≈49 %): las clases no son
            # equivalentes entre sensores y el k deja de ser estable (lotes L5_high_*).
            log.warning("min_conf_class = high: las clases de confianza de MODIS y VIIRS no son equivalentes "
                        "en ese corte; el k nocturno queda inestable. Usar solo para pruebas de sensibilidad.")
        by = self.raw.get("baseline_years")
        if by is not None and not (isinstance(by, list) and len(by) == 2 and by[0] <= by[1]):
            raise ValueError(f"baseline_years inválido: {by} (se espera [desde, hasta] o null)")

    def __getitem__(self, key: str) -> Any:
        return self.raw[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self.raw.get(key, default)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "prehack.duckdb"

    def parquet_dir(self, table: str) -> Path:
        return self.data_dir / table

    def date(self, key: str) -> dt.date | None:
        return to_date(self.raw.get(key))

    @property
    def zone_outline(self) -> Path | None:
        z = self.raw.get("zone") or {}
        return (self.base_dir / z["outline"]).resolve() if z.get("outline") else None

    @property
    def reference_platforms(self) -> list[str]:
        return REFERENCES[self.raw["reference"]]

    @property
    def aqua_start(self) -> dt.date:
        for p in self.raw["platform_periods"]:
            if p["platform"] == "aqua" and p["kind"] == "operación":
                return to_date(p["valid_from"])
        raise ValueError("platform_periods no define la operación de aqua")

    def level_res(self, level: str) -> int | None:
        """Resolución H3 de un nivel de calibración (None para global)."""
        return None if level == "global" else int(level[1:])

    def level_region_sql(self, level: str, alias: str = "f") -> str:
        """Expresión SQL de la región de `level` para una fila de fires_daily."""
        res = self.level_res(level)
        if res is None:
            return "0::UBIGINT"
        if res == self.raw["h3"]["region_res"]:
            return f"{alias}.region_r3"
        if res == self.raw["h3"]["fallback_res"]:
            return f"{alias}.region_r2"
        return f"h3_parent({alias}.cell, {res})"

    @property
    def baseline_years(self) -> tuple[int, int] | None:
        by = self.raw.get("baseline_years")
        return (int(by[0]), int(by[1])) if by else None

    def baseline_sql(self, col: str = "year") -> str:
        """Condición SQL: el año pertenece al período base de la mediana."""
        by = self.baseline_years
        return f"{col} BETWEEN {by[0]} AND {by[1]}" if by else "true"

    @property
    def calibration_from(self) -> list[Path]:
        """Bases de otros lotes cuyos fires_daily se suman al ajustar k (calibración común a varios lotes)."""
        return [(self.base_dir / p).resolve() for p in (self.raw.get("calibration_from") or [])]

    @property
    def calibration_key(self) -> str | None:
        """Identifica una calibración común: mismos parámetros (sin `countries`) y mismas bases.

        Dos lotes con la misma clave llegan al mismo k, así que el segundo puede copiarlo del primero.
        """
        if not self.calibration_from:
            return None
        # Sin el calendario: cada lote puede cortar su serie en otra fecha. Que la ventana de ajuste sea
        # la misma se verifica al copiar (calibrate.reuse_common).
        skip = ("countries", "calibration_from", "calendar_start", "calendar_end")
        sub = {k: self.raw.get(k) for k in HASHED_KEYS if k not in skip}
        sub["bases"] = sorted(str(p).lower() for p in self.calibration_from)
        blob = json.dumps(sub, sort_keys=True, default=str, ensure_ascii=False)
        return hashlib.sha256(blob.encode()).hexdigest()[:12]

    @property
    def min_conf_rank(self) -> int:
        return CONF_ORDER.index(self.raw["min_conf_class"])

    @property
    def config_hash(self) -> str:
        sub = {k: self.raw.get(k) for k in HASHED_KEYS}
        blob = json.dumps(sub, sort_keys=True, default=str, ensure_ascii=False)
        return hashlib.sha256(blob.encode()).hexdigest()[:12]


def load_config(path: str | Path = "config.yaml", overrides: dict | None = None) -> Config:
    path = Path(path).resolve()
    raw = _load_yaml(path)
    if overrides:
        raw = _merge(raw, overrides)
    return Config(raw=raw, base_dir=path.parent)


def _load_yaml(path: Path, depth: int = 0) -> dict:
    """Lee un YAML. Con `extends: <otro.yaml>` parte de ese archivo y le aplica encima lo propio.

    Las rutas (`paths`, `zone.outline`, `calibration_from`) siempre son relativas a la carpeta del
    archivo que se pasó a load_config, no a la del archivo base: el que extiende tiene que declararlas.
    """
    if depth > 5:
        raise ValueError(f"extends anidado demasiadas veces en {path}")
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    base = raw.pop("extends", None)
    if base:
        raw = _merge(_load_yaml((path.parent / base).resolve(), depth + 1), raw)
    return raw


def _merge(a: dict, b: dict) -> dict:
    out = dict(a)
    for k, v in b.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out
