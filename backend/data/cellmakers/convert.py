#!/usr/bin/env python3
"""Convert cellmakers Excel files to TSV format.

Usage:
    python convert.py [--src /path/to/cellmakers]

Reads Cell_marker_Human.xlsx and Cell_marker_Mouse.xlsx,
outputs human_markers.tsv and mouse_markers.tsv.
"""

import argparse
import os
import sys

import openpyxl

SRC_DIR = "/data1/home/zhouy1/Projects/scRNA/cellmakers"
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

COLUMNS = [
    "species",       # 0
    "tissue_class",  # 1
    "tissue_type",   # 2
    "cell_name",     # 6
    "marker",        # 8
    "symbol",        # 9 (official gene symbol)
    "marker_source", # 15
]

COL_INDICES = [0, 1, 2, 6, 8, 9, 15]


def convert(src_path: str, out_path: str) -> int:
    wb = openpyxl.load_workbook(src_path, read_only=True)
    ws = wb.active
    rows_written = 0

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\t".join(COLUMNS) + "\n")
        for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
            vals = [row[idx] for idx in COL_INDICES]
            # Skip rows with missing cell_name or marker
            if not vals[3] or not vals[4]:
                continue
            # Clean marker name (strip trailing commas)
            vals[4] = str(vals[4]).strip().rstrip(",")
            # Clean symbol (strip whitespace)
            if vals[5]:
                vals[5] = str(vals[5]).strip()
            # Convert None to empty string
            vals = [str(v) if v is not None else "" for v in vals]
            f.write("\t".join(vals) + "\n")
            rows_written += 1

    wb.close()
    return rows_written


def main():
    parser = argparse.ArgumentParser(description="Convert cellmakers Excel to TSV")
    parser.add_argument("--src", default=SRC_DIR, help="Source directory with Excel files")
    args = parser.parse_args()

    for species, fname in [("Human", "Cell_marker_Human.xlsx"), ("Mouse", "Cell_marker_Mouse.xlsx")]:
        src = os.path.join(args.src, fname)
        out = os.path.join(OUT_DIR, f"{species.lower()}_markers.tsv")
        if not os.path.exists(src):
            print(f"SKIP: {src} not found", file=sys.stderr)
            continue
        n = convert(src, out)
        print(f"{fname} -> {out} ({n} rows)")


if __name__ == "__main__":
    main()
