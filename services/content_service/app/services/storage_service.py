"""
MinIO/S3-compatible object storage service.

Used for storing:
- PDF notes and study materials
- Video thumbnails
- Practice paper PDFs
- Profile pictures

Provides presigned URLs for direct CDN-style access.
"""
import io
import json
import logging
import mimetypes
from datetime import timedelta
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageService:
    def __init__(self):
        self._client = None
        self._setup()

    def _setup(self) -> None:
        if not settings.MINIO_ENDPOINT:
            logger.warning("MINIO_ENDPOINT not set; file storage disabled")
            return
        try:
            from minio import Minio
            url = settings.MINIO_ENDPOINT.replace("http://", "").replace("https://", "")
            secure = settings.MINIO_ENDPOINT.startswith("https://")
            self._client = Minio(
                url,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=secure,
            )
            self._ensure_bucket()
            logger.info("MinIO storage connected: %s", url)
        except ImportError:
            logger.warning("minio package not installed; file storage unavailable")
        except Exception as exc:
            logger.error("MinIO setup failed: %s", exc)

    def _ensure_bucket(self) -> None:
        if not self._client:
            return
        if not self._client.bucket_exists(settings.MINIO_BUCKET):
            self._client.make_bucket(settings.MINIO_BUCKET)
            # Set public read policy for CDN-style access
            policy = json.dumps({
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{settings.MINIO_BUCKET}/*"],
                }],
            })
            self._client.set_bucket_policy(settings.MINIO_BUCKET, policy)
            logger.info("Created MinIO bucket: %s", settings.MINIO_BUCKET)

    def upload(self, file_bytes: bytes, object_name: str, content_type: str | None = None) -> str:
        """Upload file and return public URL."""
        if not self._client:
            return ""
        if not content_type:
            content_type, _ = mimetypes.guess_type(object_name)
            content_type = content_type or "application/octet-stream"
        self._client.put_object(
            settings.MINIO_BUCKET,
            object_name,
            io.BytesIO(file_bytes),
            length=len(file_bytes),
            content_type=content_type,
        )
        endpoint = settings.MINIO_ENDPOINT.rstrip("/")
        return f"{endpoint}/{settings.MINIO_BUCKET}/{object_name}"

    def get_presigned_url(self, object_name: str, expires_seconds: int = 3600) -> str:
        """Get a time-limited presigned URL for private objects."""
        if not self._client:
            return ""
        return self._client.presigned_get_object(
            settings.MINIO_BUCKET,
            object_name,
            expires=timedelta(seconds=expires_seconds),
        )

    def delete(self, object_name: str) -> None:
        if self._client:
            self._client.remove_object(settings.MINIO_BUCKET, object_name)

    @property
    def available(self) -> bool:
        return self._client is not None
