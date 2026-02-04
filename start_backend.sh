#!/bin/bash
cd /home/zhuk/work/OfficeCal/backend
source myenv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
