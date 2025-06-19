#!/bin/bash

# IMPORTANT: For non-interactive scripts, 'conda activate' can be problematic
# because it relies on the shell's initialization.
# A more robust and recommended way to run commands within a Conda environment
# from a script is to use 'conda run'. This command directly executes a process
# in the specified environment without needing to manually source 'conda.sh'.

# Navigate to the application's root directory for module discovery.
# This is crucial for Python to correctly find your 'app' module using 'python -m'.
#
# Let's assume a common project structure:
# full-stack-fastapi-template/
# ├── backend/
# │   ├── app/
# │   │   └── initial_data.py  (the Python script you want to run)
# │   └── initial_data.sh      (this shell script)
# └── ...
#
# If `initial_data.sh` is located in `full-stack-fastapi-template/backend/`,
# and `app` is a subdirectory of `backend/`, then the Python command
# `python -m app.initial_data` needs to be executed from the `backend/` directory.
#
# If you are running this shell script from a different directory (e.g., `engine/`),
# Python's module import system won't automatically find 'app' unless the parent
# directory of 'app' is in the `PYTHONPATH` or you change the current working directory.
#
# The safest way is to change the current working directory to the script's location.

# Store the current directory to return to it later if needed (good practice for multi-step scripts).
CURRENT_DIR=$(pwd)

# Get the absolute path of the directory where this script is located.
# This is a robust way to ensure we always navigate to the correct 'backend' directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
cd "$SCRIPT_DIR"

# Execute your Python script within the specified Conda environment using 'conda run'.
# -n fastapi_env specifies the Conda environment to use.
# This completely avoids the 'source conda.sh' issue and is generally more reliable.
conda run -n fastapi_env python -m app.initial_data

# Important Note: The 'ModuleNotFoundError: No module named 'sqlmodel'' indicates that
# the 'sqlmodel' package is not installed in your 'fastapi_env' Conda environment.
# After running this script, if you still get the 'sqlmodel' error,
# you will need to activate your environment manually and install it:
#
# conda activate fastapi_env
# pip install sqlmodel
# # or if it's a conda package:
# # conda install sqlmodel
#
# Then try running this script again.

# Optional Good Practice: Return to the original directory if the script is part of a larger workflow.
cd "$CURRENT_DIR"
