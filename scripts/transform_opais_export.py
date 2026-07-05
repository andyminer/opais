#!/usr/bin/env python3

"""Convert the nationwide OPAIS CE export into the JSON artifacts used by the
340B network visualization.

Typical usage — regenerate everything the frontend consumes:

    python3 scripts/transform_opais_export.py OPA_CE_DAILY_PUBLIC.JSON \
        -o . --national-summary --pharmacy-index

Regenerate only the national summary and pharmacy index (skip the 54 state
files):

    python3 scripts/transform_opais_export.py OPA_CE_DAILY_PUBLIC.JSON \
        -o . --national-summary --pharmacy-index --no-state-files

Outputs:
    opais_network_<STATE>.json   per-state CE/pharmacy graphs
    opais_network_national.json  state-level summary graph (--national-summary)
    opais_pharmacy_index.json    pharmacy -> CE-states index (--pharmacy-index)

All artifacts carry a generated date and schema version so piecemeal
regeneration drift is detectable.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

# Bump when the shape of any emitted artifact changes.
SCHEMA_VERSION = 2

US_STATE_NAMES: dict[str, str] = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
    "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
    "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
    "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
    "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
    "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
    "PR": "Puerto Rico", "VI": "Virgin Islands", "GU": "Guam",
    "AS": "American Samoa", "MP": "Northern Mariana Islands",
}

HOSPITAL_ENTITY_TYPES: set[str] = {"DSH", "CAH", "RRC", "PED", "SCH", "CAN"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Transform OPA_CE_DAILY_PUBLIC.JSON into the nodes/links schema used by "
            "the 340B network visualization."
        )
    )
    parser.add_argument("input", type=Path, help="Path to the OPAIS export JSON file.")
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=Path("."),
        help="Directory where output JSON files should be written.",
    )
    parser.add_argument(
        "-s",
        "--states",
        nargs="*",
        help="Optional list of state abbreviations to emit. Defaults to all states found.",
    )
    parser.add_argument(
        "--no-state-files",
        action="store_true",
        help="Skip per-state opais_network_<STATE>.json generation.",
    )
    parser.add_argument(
        "--include-inactive-entities",
        action="store_true",
        help="Include covered entities whose participating flag is FALSE.",
    )
    parser.add_argument(
        "--include-terminated-contracts",
        action="store_true",
        help="Include contract pharmacies with a terminationDate.",
    )
    parser.add_argument(
        "--keep-empty-entities",
        action="store_true",
        help="Include covered entities even if they have no included contract pharmacies.",
    )
    parser.add_argument(
        "--national-summary",
        action="store_true",
        help="Also generate opais_network_national.json with state-level summary graph.",
    )
    parser.add_argument(
        "--pharmacy-index",
        action="store_true",
        help="Also generate opais_pharmacy_index.json mapping each pharmacy to its CE states.",
    )
    return parser.parse_args()


def load_covered_entities(path: Path) -> list[dict[str, Any]]:
    with path.open() as handle:
        payload = json.load(handle)

    if not isinstance(payload, dict) or "coveredEntities" not in payload:
        raise ValueError("Expected top-level object with a coveredEntities array.")

    covered_entities = payload["coveredEntities"]
    if not isinstance(covered_entities, list):
        raise ValueError("coveredEntities must be a list.")

    return covered_entities


def format_date(value: str | None) -> str:
    if not value:
        return ""

    # OPAIS currently emits ISO-like timestamps such as 2026-02-19T09:40:05.7903318.
    date_part = value.split("T", 1)[0]
    return datetime.strptime(date_part, "%Y-%m-%d").strftime("%m/%d/%Y")


def compact(record: dict[str, str]) -> dict[str, str]:
    """Drop empty-string fields — the frontend treats missing and '' alike,
    and empty fields are a large share of the payload at 230K+ links."""
    return {key: value for key, value in record.items() if value != ""}


def build_ce_node(ce: dict[str, Any]) -> dict[str, str]:
    address = ce.get("streetAddress") or {}
    return compact({
        "id": str(ce.get("id340B") or ""),
        "ceId": str(ce.get("ceId") or ""),
        "entityType": str(ce.get("entityType") or ""),
        "entityName": str(ce.get("name") or ""),
        "entitySubName": str(ce.get("subName") or ""),
        "address1": str(address.get("addressLine1") or ""),
        "address2": str(address.get("addressLine2") or ""),
        "address3": str(address.get("addressLine3") or ""),
        "city": str(address.get("city") or ""),
        "state": str(address.get("state") or ""),
        "zip": str(address.get("zip") or ""),
        "type": "CE",
    })


def build_pharmacy_node(contract_pharmacy: dict[str, Any]) -> dict[str, str]:
    address = contract_pharmacy.get("address") or {}
    return compact({
        "id": str(contract_pharmacy["pharmacyId"]),
        "pharmacyName": str(contract_pharmacy.get("name") or ""),
        "cpAddress1": str(address.get("addressLine1") or ""),
        "cpAddress2": str(address.get("addressLine2") or ""),
        "cpAddress3": str(address.get("addressLine3") or ""),
        "cpCity": str(address.get("city") or ""),
        "cpState": str(address.get("state") or ""),
        "cpZip": str(address.get("zip") or ""),
        "type": "Pharmacy",
    })


def build_link(ce: dict[str, Any], contract_pharmacy: dict[str, Any]) -> dict[str, str]:
    # termDate is omitted for open contracts — the frontend renders a missing
    # termDate as "Open". (An approvalDate field existed historically but the
    # OPAIS export never populates it, so it is no longer emitted.)
    return compact({
        "source": str(ce["id340B"]),
        "target": str(contract_pharmacy["pharmacyId"]),
        "contractID": str(contract_pharmacy["contractId"]),
        "beginDate": format_date(contract_pharmacy.get("beginDate")),
        "termDate": format_date(contract_pharmacy.get("terminationDate")),
    })


def should_include_entity(ce: dict[str, Any], include_inactive_entities: bool) -> bool:
    if include_inactive_entities:
        return True
    return ce.get("participating") == "TRUE"


def should_include_contract(contract_pharmacy: dict[str, Any], include_terminated: bool) -> bool:
    if include_terminated:
        return True
    return not contract_pharmacy.get("terminationDate")


def dedupe_node(existing: dict[str, str], candidate: dict[str, str]) -> dict[str, str]:
    if not existing:
        return dict(candidate)

    merged = dict(existing)
    for key, value in candidate.items():
        if not merged.get(key) and value:
            merged[key] = value
    return merged


def artifact_metadata(**extra: Any) -> dict[str, Any]:
    return {
        "generated": datetime.now().strftime("%Y-%m-%d"),
        "schemaVersion": SCHEMA_VERSION,
        **extra,
    }


def build_state_graphs(
    covered_entities: list[dict[str, Any]],
    *,
    include_inactive_entities: bool,
    include_terminated_contracts: bool,
    keep_empty_entities: bool,
) -> dict[str, dict[str, Any]]:
    state_nodes: dict[str, dict[str, dict[str, str]]] = defaultdict(dict)
    state_links: dict[str, list[dict[str, str]]] = defaultdict(list)

    for ce in covered_entities:
        state = str((ce.get("streetAddress") or {}).get("state") or "").upper()
        if not state or not should_include_entity(ce, include_inactive_entities):
            continue

        ce_node = build_ce_node(ce)
        ce_id = ce_node["id"]
        included_contracts = [
            cp
            for cp in ce.get("contractPharmacies") or []
            if should_include_contract(cp, include_terminated_contracts)
        ]

        if included_contracts or keep_empty_entities:
            existing_ce = state_nodes[state].get(ce_id)
            state_nodes[state][ce_id] = dedupe_node(existing_ce or {}, ce_node)

        for contract_pharmacy in included_contracts:
            pharmacy_node = build_pharmacy_node(contract_pharmacy)
            pharmacy_id = pharmacy_node["id"]

            existing_pharmacy = state_nodes[state].get(pharmacy_id)
            state_nodes[state][pharmacy_id] = dedupe_node(existing_pharmacy or {}, pharmacy_node)

            state_links[state].append(build_link(ce, contract_pharmacy))

    payloads: dict[str, dict[str, Any]] = {}
    for state, nodes_by_id in state_nodes.items():
        nodes = sorted(
            nodes_by_id.values(),
            key=lambda node: (node.get("type") != "CE", node.get("id", "")),
        )
        links = sorted(
            state_links[state],
            key=lambda link: (
                link["source"],
                link["target"],
                link.get("beginDate", ""),
                link["contractID"],
            ),
        )
        payloads[state] = {
            "metadata": artifact_metadata(state=state),
            "nodes": nodes,
            "links": links,
        }

    return payloads


def build_national_summary(
    covered_entities: list[dict[str, Any]],
    *,
    include_inactive_entities: bool = False,
    include_terminated_contracts: bool = False,
) -> dict[str, Any]:
    """Build a national-level summary graph with one node per state and cross-state links."""

    # Per-state accumulators
    participating_ce_ids_by_state: dict[str, set[str]] = defaultdict(set)
    ce_ids_by_state: dict[str, set[str]] = defaultdict(set)
    contracted_pharmacy_ids_by_state: dict[str, set[str]] = defaultdict(set)  # pharmacies contracted with state's CEs
    contract_count_by_state: dict[str, int] = defaultdict(int)
    hospital_ids_by_state: dict[str, set[str]] = defaultdict(set)
    grantee_ids_by_state: dict[str, set[str]] = defaultdict(set)
    in_state_contracts: dict[str, int] = defaultdict(int)
    out_of_state_contracts: dict[str, int] = defaultdict(int)

    # Cross-state link accumulators: (ce_state, pharm_state) -> count and distinct CEs
    cross_state_weight: dict[tuple[str, str], int] = defaultdict(int)
    cross_state_ces: dict[tuple[str, str], set[str]] = defaultdict(set)

    # Global totals
    total_participating_ce_ids: set[str] = set()
    total_ce_ids_with_contracts: set[str] = set()
    total_pharmacy_ids: set[str] = set()
    total_contracts = 0

    for ce in covered_entities:
        if not should_include_entity(ce, include_inactive_entities):
            continue

        ce_address = ce.get("streetAddress") or {}
        ce_state = str(ce_address.get("state") or "").upper()
        if not ce_state:
            continue

        ce_id = str(ce.get("id340B") or "")
        entity_type = str(ce.get("entityType") or "").upper()

        # "Participating" counts stay literal regardless of include flags —
        # they describe program participation, not inclusion in this artifact
        if ce.get("participating") == "TRUE":
            total_participating_ce_ids.add(ce_id)
            participating_ce_ids_by_state[ce_state].add(ce_id)

        included_contracts = [
            cp
            for cp in ce.get("contractPharmacies") or []
            if should_include_contract(cp, include_terminated_contracts)
        ]

        if not included_contracts:
            continue

        ce_ids_by_state[ce_state].add(ce_id)
        total_ce_ids_with_contracts.add(ce_id)

        if entity_type in HOSPITAL_ENTITY_TYPES:
            hospital_ids_by_state[ce_state].add(ce_id)
        else:
            grantee_ids_by_state[ce_state].add(ce_id)

        for cp in included_contracts:
            total_contracts += 1
            contract_count_by_state[ce_state] += 1

            pharm_address = cp.get("address") or {}
            pharm_state = str(pharm_address.get("state") or "").upper()
            pharm_id = str(cp.get("pharmacyId") or "")

            contracted_pharmacy_ids_by_state[ce_state].add(pharm_id)
            total_pharmacy_ids.add(pharm_id)

            if pharm_state and pharm_state == ce_state:
                in_state_contracts[ce_state] += 1
            elif pharm_state:
                out_of_state_contracts[ce_state] += 1
                pair = (ce_state, pharm_state)
                cross_state_weight[pair] += 1
                cross_state_ces[pair].add(ce_id)

    # Collect all states that have at least 1 included contract
    all_states = set(contract_count_by_state.keys())

    nodes = []
    for state in sorted(all_states):
        nodes.append({
            "id": state,
            "type": "State",
            "label": US_STATE_NAMES.get(state, state),
            "participatingCeCount": len(participating_ce_ids_by_state[state]),
            "ceCount": len(ce_ids_by_state[state]),
            "pharmacyCount": len(contracted_pharmacy_ids_by_state[state]),
            "contractCount": contract_count_by_state[state],
            "hospitalCount": len(hospital_ids_by_state[state]),
            "granteeCount": len(grantee_ids_by_state[state]),
            "inStateContracts": in_state_contracts[state],
            "outOfStateContracts": out_of_state_contracts[state],
        })

    links = []
    for (source, target) in sorted(cross_state_weight.keys()):
        links.append({
            "source": source,
            "target": target,
            "weight": cross_state_weight[(source, target)],
            "ceCount": len(cross_state_ces[(source, target)]),
        })

    metadata = artifact_metadata(
        totalParticipatingCEs=len(total_participating_ce_ids),
        totalCEsWithContracts=len(total_ce_ids_with_contracts),
        totalPharmacies=len(total_pharmacy_ids),
        totalContracts=total_contracts,
    )

    return {"metadata": metadata, "nodes": nodes, "links": links}


def build_pharmacy_index(
    covered_entities: list[dict[str, Any]],
    *,
    include_inactive_entities: bool = False,
    include_terminated_contracts: bool = False,
) -> dict[str, Any]:
    """Build a pharmacy index mapping each pharmacy ID to its CE states and
    distinct-CE count. The "_meta" key cannot collide with pharmacy IDs,
    which are strictly numeric."""

    pharmacy_states: dict[str, set[str]] = defaultdict(set)
    # Distinct CEs per pharmacy — a pharmacy holding multiple active contracts
    # with the same CE must not be counted twice
    pharmacy_ce_ids: dict[str, set[str]] = defaultdict(set)

    for ce in covered_entities:
        if not should_include_entity(ce, include_inactive_entities):
            continue

        ce_address = ce.get("streetAddress") or {}
        ce_state = str(ce_address.get("state") or "").upper()
        if not ce_state:
            continue

        ce_id = str(ce.get("id340B") or "")

        for cp in ce.get("contractPharmacies") or []:
            if not should_include_contract(cp, include_terminated_contracts):
                continue
            pharm_id = str(cp.get("pharmacyId") or "")
            if not pharm_id:
                continue
            pharmacy_states[pharm_id].add(ce_state)
            pharmacy_ce_ids[pharm_id].add(ce_id)

    index: dict[str, Any] = {"_meta": artifact_metadata(pharmacies=len(pharmacy_states))}
    for pharm_id in sorted(pharmacy_states):
        index[pharm_id] = {
            "states": sorted(pharmacy_states[pharm_id]),
            "ceCount": len(pharmacy_ce_ids[pharm_id]),
        }

    return index


def main() -> None:
    args = parse_args()
    covered_entities = load_covered_entities(args.input)

    requested_states = None
    if args.states:
        requested_states = {state.upper() for state in args.states}

    args.output_dir.mkdir(parents=True, exist_ok=True)

    emitted = 0

    if not args.no_state_files:
        graphs = build_state_graphs(
            covered_entities,
            include_inactive_entities=args.include_inactive_entities,
            include_terminated_contracts=args.include_terminated_contracts,
            keep_empty_entities=args.keep_empty_entities,
        )

        for state in sorted(graphs):
            if requested_states and state not in requested_states:
                continue

            output_path = args.output_dir / f"opais_network_{state}.json"
            with output_path.open("w") as handle:
                json.dump(graphs[state], handle, separators=(",", ":"))
            emitted += 1

            print(
                f"{state}: {len(graphs[state]['nodes'])} nodes, "
                f"{len(graphs[state]['links'])} links -> {output_path}"
            )

    if args.national_summary:
        national = build_national_summary(
            covered_entities,
            include_inactive_entities=args.include_inactive_entities,
            include_terminated_contracts=args.include_terminated_contracts,
        )
        national_path = args.output_dir / "opais_network_national.json"
        with national_path.open("w") as handle:
            json.dump(national, handle, indent=2)
        print(
            f"National summary: {len(national['nodes'])} state nodes, "
            f"{len(national['links'])} cross-state links, "
            f"{national['metadata']['totalContracts']} total contracts "
            f"-> {national_path}"
        )
        emitted += 1

    if args.pharmacy_index:
        index = build_pharmacy_index(
            covered_entities,
            include_inactive_entities=args.include_inactive_entities,
            include_terminated_contracts=args.include_terminated_contracts,
        )
        index_path = args.output_dir / "opais_pharmacy_index.json"
        with index_path.open("w") as handle:
            json.dump(index, handle, separators=(",", ":"))
        print(
            f"Pharmacy index: {index['_meta']['pharmacies']} pharmacies -> {index_path} "
            f"({index_path.stat().st_size / 1024:.0f} KB)"
        )
        emitted += 1

    if emitted == 0:
        raise SystemExit(
            "Nothing was emitted. Enable at least one output "
            "(state files, --national-summary, --pharmacy-index)."
        )


if __name__ == "__main__":
    main()
