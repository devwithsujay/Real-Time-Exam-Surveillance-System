"""
ARGUS Autonomous AI Exam Surveillance Platform
Automated Test Suite & Forensic Benchmark Runner (Upgraded v2.0)

Delegates to backend.startup_tests.suite.AdvancedTestSuiteRunner, executing
all 16 comprehensive empirical verification tests across:
1. Functional Accuracy (TC-CORE-01, TC-CORE-02, TC-TRK-01, TC-ANOM-01, TC-CORE-03)
2. System Performance (TC-PERF-01, TC-PERF-02, TC-EVID-01, TC-REC-01)
3. Robustness and Security (TC-EDGE-03, TC-EDGE-02, TC-EDGE-01, TC-ERR-01, TC-CORE-04, TC-API-01, TC-SM-01)
"""

import sys
from typing import Optional, Dict, Any

from backend.startup_tests.suite import (
    AdvancedTestSuiteRunner,
    TestResult,
    run_startup_suite
)

# Backward-compatibility alias
AutomatedTestSuiteRunner = AdvancedTestSuiteRunner


def run_automated_suite(
    output_dir: Optional[str] = None,
    quick_mode: Optional[bool] = None,
    smoke_mode: Optional[bool] = None
) -> Dict[str, Any]:
    """Execute the full 16-test ARGUS automated verification suite."""
    return run_startup_suite(output_dir=output_dir, quick_mode=quick_mode, smoke_mode=smoke_mode)


if __name__ == "__main__":
    is_quick = "--quick" in sys.argv or "-q" in sys.argv
    result = run_automated_suite(quick_mode=is_quick)
    failed = result["summary"]["failed"]
    sys.exit(0 if failed == 0 else 1)
