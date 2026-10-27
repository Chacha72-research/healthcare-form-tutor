import sys

if sys.version_info < (3, 10):
    raise SystemExit(
        f"This app needs Python 3.10 or newer, but this is Python {sys.version_info.major}.{sys.version_info.minor}. "
        "Install Python 3.13 from https://www.python.org/downloads/ and recreate the virtual environment "
        "(see 'Run it locally' in the README)."
    )
