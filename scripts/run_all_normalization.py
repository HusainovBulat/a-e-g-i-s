import subprocess
import sys
import os

SCRIPTS = [
    "build_table_a.py",
    "build_table_b.py",
    "build_table_c.py",
    "build_table_d.py",
    "build_thresholds.py"
]

def run_all():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    print("=" * 60)
    print("PROJECT A.E.G.I.S. — MASTER DATA NORMALIZATION PIPELINE")
    print("NASA Space Apps Challenge 2026")
    print("=" * 60)
    
    for s in SCRIPTS:
        full_path = os.path.join(script_dir, s)
        print(f"\n>>> Running {s}...")
        res = subprocess.run([sys.executable, full_path], capture_output=True, text=True)
        if res.returncode != 0:
            print(f"FAILED on {s}:")
            print(res.stderr)
            sys.exit(1)
        else:
            print(res.stdout.strip())
            
    print("\n" + "=" * 60)
    print("ALL 4 TABLES & PROTOCOLS SUCCESSFULLY NORMALIZED & EXPORTED!")
    print("Location: D:\\PycharmProject\\nasa_hakaton\\data\\")
    print("=" * 60)

if __name__ == "__main__":
    run_all()
