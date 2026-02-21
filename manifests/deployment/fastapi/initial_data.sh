#!/bin/bash
# FastAPI initial data script

# Dynamically determine the directory of the script and change to that directory
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run the initial data script using the conda environment
conda run -n fastapi_env python -m app.initial_data
