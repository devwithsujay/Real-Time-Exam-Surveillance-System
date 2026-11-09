"""
ARGUS Startup & Forensic Verification Suite CLI.
Run via:
    python -m backend.startup_tests [--quick] [--output <dir>]
"""

import sys
import argparse
from backend.startup_tests.suite import run_startup_suite


def main():
    parser = argparse.ArgumentParser(description="ARGUS Empirical Verification & Benchmark Suite (v2.0)")
    parser.add_argument("--quick", "-q", action="store_true", help="Run in quick mode (condensed soak & frame timing)")
    parser.add_argument("--output", "-o", default=None, help="Directory to save generated reports")
    args = parser.parse_args()

    result = run_startup_suite(output_dir=args.output, quick_mode=args.quick)
    failed = result["summary"]["failed"]
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
