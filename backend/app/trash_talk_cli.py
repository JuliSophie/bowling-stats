"""Local JSON catalog maintenance. No database is used by normal commands."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from app.config import Settings
from app.services.trash_talk_catalog import coverage, disable, import_candidates, read_catalog, validate_catalog, enabled_catalog
from app.services.trash_talk_generation import generate, generation_plan
from app.services.trash_talk_repository import TrashTalkRepository

def main() -> int:
    parser = argparse.ArgumentParser(description="Lokale Trash-Talk-Pflege; Browser-History ist schreibgeschützt.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("validate"); commands.add_parser("coverage")
    imp = commands.add_parser("import"); imp.add_argument("file", type=Path)
    dis = commands.add_parser("disable"); dis.add_argument("id")
    gen = commands.add_parser("generate"); gen.add_argument("scenario"); gen.add_argument("--model", required=True)
    gen.add_argument("--count", type=int, default=10); gen.add_argument("--max-output-tokens", type=int, default=4096)
    gen.add_argument("--input-usd-per-million", type=float, required=True); gen.add_argument("--output-usd-per-million", type=float, required=True)
    gen.add_argument("--total-budget-usd", type=float, required=True); gen.add_argument("--execute", action="store_true")
    args = parser.parse_args(); repo = TrashTalkRepository()
    try:
        if args.command == "validate":
            enabled_catalog(repo)
            print("OK")
            return 0
        if args.command == "coverage": print(json.dumps(coverage(repo), ensure_ascii=False, indent=2)); return 0
        if args.command == "import":
            if args.file.stat().st_size > 1_048_576: raise ValueError("Importdatei darf höchstens 1 MiB groß sein.")
            payload = json.loads(args.file.read_text(encoding="utf-8"))
            result = import_candidates(repo, payload)
        elif args.command == "disable":
            disable(repo, args.id)
            result = {"disabled": args.id}
        else:
            plan = generation_plan(args.scenario, args.model, args.count, args.max_output_tokens, args.input_usd_per_million,
                                   args.output_usd_per_million, args.total_budget_usd)
            result = generate(plan, execute=args.execute, repository=repo, settings=Settings() if args.execute else None)
        print(json.dumps(result, ensure_ascii=False, indent=2)); return 0
    except (ValueError, OSError, RuntimeError) as exc:
        parser.exit(1, f"Fehler: {exc}\n")

if __name__ == "__main__":
    raise SystemExit(main())
