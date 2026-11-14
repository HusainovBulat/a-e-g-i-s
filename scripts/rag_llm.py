"""
PROJECT A.E.G.I.S. (v4.0) — Mode 3 Commander RAG-LLM Module
Mirror module in scripts/ directory for seamless import from anywhere.
"""
import sys
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from rag_llm import *
