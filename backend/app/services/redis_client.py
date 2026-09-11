import json
import logging
from functools import lru_cache

from typing import Optional

import redis as sync_redis
import redis.asyncio as aioredis

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@lru_cache()
def _sync_pool():
    return sync_redis.ConnectionPool.from_url(
        settings.REDIS_URL,
        max_connections=settings.REDIS_POOL_SIZE,
        socket_connect_timeout=1.0,
        socket_timeout=1.0
    )


def get_redis() -> sync_redis.Redis:
    return sync_redis.Redis(
        connection_pool=_sync_pool(),
        socket_connect_timeout=1.0,
        socket_timeout=1.0
    )


_async_client = None


def get_async_redis() -> aioredis.Redis:
    global _async_client
    if _async_client is None:
        _async_client = aioredis.from_url(
            settings.REDIS_URL,
            max_connections=settings.REDIS_POOL_SIZE,
            socket_connect_timeout=1.0,
            socket_timeout=1.0
        )
    return _async_client


def is_available() -> bool:
    try:
        return bool(get_redis().ping())
    except Exception:
        return False


async def cache_get(key: str):
    try:
        val = await get_async_redis().get(key)
        return json.loads(val) if val else None
    except Exception as e:
        logger.debug(f"Redis cache_get failed: {e}")
        return None


async def cache_set(key: str, value, ttl: Optional[int] = None):
    try:
        await get_async_redis().set(key, json.dumps(value, default=str), ex=ttl or settings.REDIS_CACHE_TTL)
    except Exception as e:
        logger.debug(f"Redis cache_set failed: {e}")


async def cache_delete(key: str):
    try:
        await get_async_redis().delete(key)
    except Exception as e:
        logger.debug(f"Redis cache_delete failed: {e}")


async def publish(channel: str, message: dict):
    try:
        await get_async_redis().publish(channel, json.dumps(message, default=str))
    except Exception as e:
        logger.debug(f"Redis publish failed: {e}")
