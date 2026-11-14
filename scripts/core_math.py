"""
PROJECT A.E.G.I.S. (v4.0) — Core Mathematical & Deterministic Safety Engine
Mirror module in scripts/ directory for seamless import from anywhere.
"""
import sys
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from core_math import *
