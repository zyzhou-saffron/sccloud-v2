"""Marker gene matching: map annotated cell types to cellmakers database."""

import os
import re
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "cellmakers")


def _normalize(name: str) -> str:
    """Lowercase, keep only alphanumeric."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


# Common abbreviations used in SingleR output
_ABBREVIATIONS = {
    "nk": "natural killer",
    "dc": "dendritic cell",
    "nkt": "natural killer t",
    "treg": "regulatory t",
    "tfh": "follicular helper t",
    "tcm": "central memory t",
    "tem": "effector memory t",
    "ma": "macrophage",
}


def _expand_abbreviations(name: str) -> set[str]:
    """Expand common abbreviations to full forms."""
    variants = {name}
    lower = name.lower()
    for abbr, full in _ABBREVIATIONS.items():
        # Only expand if the abbreviation appears as a word boundary
        pattern = r'\b' + re.escape(abbr) + r'\b'
        if re.search(pattern, lower):
            expanded = re.sub(pattern, full, lower, flags=re.IGNORECASE)
            variants.add(expanded)
    return variants


def _normalize_variants(name: str) -> set[str]:
    """Return normalized variants for fuzzy matching."""
    expanded = _expand_abbreviations(name)
    all_variants: set[str] = set()
    for variant in expanded:
        base = _normalize(variant)
        all_variants.add(base)
        # Strip trailing 's' for plural handling
        if base.endswith("s") and len(base) > 2:
            all_variants.add(base[:-1])
    return all_variants


def load_markers(tsv_path: str, species: str = None, tissue: str = None) -> dict[str, list[str]]:
    """Load TSV and return { cell_name: [gene1, gene2, ...] } mapping.

    Prefers official Symbol over marker name. Deduplicates per cell_name.
    TSV columns: species, tissue_class, tissue_type, cell_name, marker, symbol, marker_source
    """
    db: dict[str, set[str]] = defaultdict(set)
    with open(tsv_path, encoding="utf-8") as f:
        header = f.readline()  # skip header
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 6:
                continue
            sp, tc, tt, cn, mk, sym = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
            if species and sp.lower() != species.lower():
                continue
            if tissue and tissue.lower() not in tt.lower() and tissue.lower() not in tc.lower():
                continue
            if cn:
                # Prefer Symbol over marker
                gene = sym.strip() if sym.strip() else mk.strip()
                if gene:
                    db[cn].add(gene)
    # Convert sets to sorted lists
    return {k: sorted(v) for k, v in db.items()}


def match_celltype(celltype: str, marker_db: dict[str, list[str]]) -> list[str]:
    """Match an annotated celltype name to marker_db, return marker list.

    Strategy:
    1. Exact match (case-insensitive)
    2. Normalized match (remove non-alphanumeric, lowercase)
    3. Normalized + strip trailing 's'
    4. Substring containment (shorter name in longer name)
    """
    if not celltype or not marker_db:
        return []

    # Build normalized index: normalized_name -> original_name
    norm_index: dict[str, str] = {}
    for cn in marker_db:
        for v in _normalize_variants(cn):
            norm_index[v] = cn

    ct_variants = _normalize_variants(celltype)

    # 1. Exact match (case-insensitive)
    ct_lower = celltype.lower()
    for cn in marker_db:
        if cn.lower() == ct_lower:
            return marker_db[cn]

    # 2. Normalized match
    for v in ct_variants:
        if v in norm_index:
            return marker_db[norm_index[v]]

    # 3. Substring containment (with abbreviation expansion)
    ct_expanded = _expand_abbreviations(celltype)
    ct_norms = {_normalize(v) for v in ct_expanded}
    best_match = None
    best_len = 0
    for cn in marker_db:
        cn_norm = _normalize(cn)
        if len(cn_norm) < 3:  # skip very short names like "DC"
            continue
        cn_expanded = _expand_abbreviations(cn)
        cn_norms = {_normalize(v) for v in cn_expanded}
        # Check if any expanded form of celltype contains any expanded form of cn or vice versa
        for ctn in ct_norms:
            for cnn in cn_norms:
                if len(cnn) >= 3 and (cnn in ctn or ctn in cnn):
                    if len(cnn) > best_len:
                        best_match = cn
                        best_len = len(cnn)
    if best_match:
        return marker_db[best_match]

    return []


def annotate_with_markers(
    scatter_data: dict, species: str = "Human", tissue: str = None
) -> list[dict]:
    """Build marker table from scatter_data and cellmakers database.

    Returns list of { cluster_id, celltype, markers, annotation_result }.
    """
    clusters = scatter_data.get("cluster", [])
    celltypes = scatter_data.get("celltype", [])

    if not clusters or not celltypes:
        return []

    # Determine TSV path
    tsv_name = "human_markers.tsv" if species.lower() == "human" else "mouse_markers.tsv"
    tsv_path = os.path.join(DATA_DIR, tsv_name)
    if not os.path.exists(tsv_path):
        return []

    # Load marker database
    marker_db = load_markers(tsv_path, species, tissue)

    # Build unique cluster -> celltype mapping
    cluster_celltype: dict[str, str] = {}
    for i in range(min(len(clusters), len(celltypes))):
        cid = str(clusters[i])
        ct = str(celltypes[i])
        if cid not in cluster_celltype:
            cluster_celltype[cid] = ct

    # Build table rows sorted by cluster_id (numeric if possible)
    rows = []
    for cid, ct in sorted(cluster_celltype.items(), key=lambda x: _sort_key(x[0])):
        markers = match_celltype(ct, marker_db)
        rows.append({
            "cluster_id": cid,
            "celltype": ct,
            "markers": markers,
            "annotation_result": ct,
        })
    return rows


def _sort_key(cluster_id: str):
    """Sort key for cluster IDs: numeric first, then alphanumeric (C1 < C2 < C10)."""
    try:
        return (0, int(cluster_id))
    except ValueError:
        # Extract numeric part for IDs like "C1", "C10"
        m = re.search(r"(\d+)", cluster_id)
        if m:
            return (0, int(m.group(1)))
        return (1, cluster_id)
