import Redis from 'ioredis';

let redisClient: Redis | null = null;
let redisEnabled = false;

export function getRedis(): Redis | null {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('Redis not configured, caching disabled');
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('Redis connection failed after 3 attempts');
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
    });

    redisClient.on('connect', () => {
      console.log('Redis connected');
      redisEnabled = true;
    });

    redisClient.on('error', (err) => {
      console.error('Redis error:', err.message);
      redisEnabled = false;
    });

    return redisClient;
  } catch (err) {
    console.error('Failed to create Redis client:', err);
    return null;
  }
}

export function isRedisEnabled(): boolean {
  return redisEnabled;
}

// Cache wrapper with TTL
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis || !redisEnabled) return null;

  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

export async function setCache(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
  const redis = getRedis();
  if (!redis || !redisEnabled) return;

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Ignore cache errors
  }
}

export async function deleteCache(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis || !redisEnabled) return;

  try {
    await redis.del(key);
  } catch {
    // Ignore cache errors
  }
}

// Health check
export async function checkRedisHealth(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
