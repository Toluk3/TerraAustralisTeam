"""Carga de config.yaml y config_hash (PLAN_NORMALIZACION.md §5.3)."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

CONF_ORDER = ["low", "nominal", "high"]
METRICS = ("n_fires", "n_clusters", "n_clusters_r7")
REFERENCES = {"terra_aqua": ["terra", "aqua"], "aqua": ["aqua"]}

# Parámetros que cambian el k: si alguno cambia, el k deja de valer y hay que reajustar.
HASHED_KEYS = [
    "countries", "min_conf_class", "modis_conf_cuts", "t_mir_range_k", "use_static_mask",
    "mask_min_months", "h3", "metric", "reference", "modis_stable_until", "switch_date",
    "terra_fit_to", "viirs_priority", "k_fallback_platform", "month_window",
    "min_source_count", "calibration_levels", "platform_periods",
]


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
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    if overrides:
        raw = _merge(raw, overrides)
    return Config(raw=raw, base_dir=path.parent)


def _merge(a: dict, b: dict) -> dict:
    out = dict(a)
    for k, v in b.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out
