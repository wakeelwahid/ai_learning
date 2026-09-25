FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
# CPU-only torch wheel — this container has no GPU, and sentence-transformers'
# default torch pull otherwise drags in ~1GB of unused nvidia/CUDA packages
# (nvidia_cudnn_cu13, cuda_toolkit, ...) that do nothing here except slow
# every build and bloat the image.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
