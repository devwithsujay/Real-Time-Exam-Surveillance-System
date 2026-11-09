#!/usr/bin/env python3
"""
ARGUS Autonomous AI Exam Surveillance Platform
Standalone Test Suite Runner

Usage:
    python run_tests.py
    python run_tests.py --output ./reports
"""

import os
import sys
import argparse

# Ensure backend and root paths are available
_root = os.path.dirname(os.path.abspath(__file__))
_backend = os.path.join(_root, "backend")

for p in [_backend, _root]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.tests.automated_test_suite import run_automated_suite


def main():
    parser = argparse.ArgumentParser(description="Run the ARGUS Automated Test Suite")
    parser.add_argument("--output", default=None, help="Custom output directory for generated reports")
    parser.add_argument("--quick", "-q", action="store_true", help="Run in quick mode (condensed soak & benchmarks)")
    args = parser.parse_args()

    result = run_automated_suite(output_dir=args.output, quick_mode=args.quick)
    failed = result["summary"]["failed"]
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
