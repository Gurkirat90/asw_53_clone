"""Operator commands: `python -m app.cli <command>`."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence


def _not_implemented(command: str, phase: str) -> Callable[[argparse.Namespace], int]:
    def handler(_args: argparse.Namespace) -> int:
        print(f"{command}: not implemented yet (arrives in {phase})", file=sys.stderr)
        return 1

    return handler


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    seed_user = subparsers.add_parser(
        "seed-demo-user", help="Create or update the demo user from DEMO_USER_* settings."
    )
    seed_user.set_defaults(handler=_not_implemented("seed-demo-user", "PROMPT 02"))

    seed_data = subparsers.add_parser(
        "seed-demo-data", help="Load demo hosted zones and records for the demo user."
    )
    seed_data.set_defaults(handler=_not_implemented("seed-demo-data", "PROMPT 03"))

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.handler(args)


if __name__ == "__main__":
    sys.exit(main())
