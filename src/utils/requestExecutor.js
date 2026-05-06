import { logger } from "../index.js";

/**
 * Retry utility
 */
// async function withRetry(
//   fn,
//   { retries = 3, baseDelay = 500, maxDelay = 10_000, shouldRetry, onRetry }
// ) {
//   let attempt = 0;

//   while (true) {
//     try {
//       return await fn();
//     } catch (err) {
//       attempt++;

//       if (attempt > retries || !shouldRetry(err)) {
//         throw err;
//       }

//       const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);

//       onRetry?.(err, attempt, delay);

//       await new Promise((r) => setTimeout(r, delay));
//     }
//   }
// }
async function withRetry(
  fn,
  { retries = 3, baseDelay = 500, maxDelay = 10_000, shouldRetry, onRetry }
) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const status = err?.response?.status;

      if (attempt > retries || !shouldRetry(err)) throw err;

      // Check for HubSpot's specific "Wait" instruction
      const retryAfter = err.response?.headers?.["retry-after"];
      let delay;

      if (status === 429 && retryAfter) {
        // HubSpot provides this in seconds, convert to ms
        delay = parseInt(retryAfter) * 1000 + 500; // Add 500ms buffer
      } else {
        // Standard exponential backoff
        delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
      }

      onRetry?.(err, attempt, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
/**
 * Simple throttle (token bucket)
 */
// class Throttle {
//   constructor({ limit, intervalMs }) {
//     this.limit = limit;
//     this.intervalMs = intervalMs;
//     this.queue = [];
//     this.active = 0;

//     setInterval(() => {
//       this.active = 0;
//       this._process();
//     }, intervalMs);
//   }

//   run(fn) {
//     return new Promise((resolve, reject) => {
//       this.queue.push({ fn, resolve, reject });
//       this._process();
//     });
//   }

//   _process() {
//     while (this.active < this.limit && this.queue.length > 0) {
//       const { fn, resolve, reject } = this.queue.shift();
//       this.active++;

//       fn().then(resolve).catch(reject);
//     }
//   }
// }
class Throttle {
  constructor({ limit, intervalMs }) {
    this.limit = limit;
    this.intervalMs = intervalMs;
    this.queue = [];
    this.processing = false;
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._process();
    });
  }

  /*************  ✨ Windsurf Command ⭐  *************/
  /**
   * Process the request queue. This function is called
   * internally by the Throttle class and should not be
   * called directly.
   *
   * It processes the queue by calling the given function
   * and then waits for a calculated delay (based on the
   * intervalMs and limit) before calling the next function
   * in the queue.
   *
   * Once the queue is empty, the processing flag is set
   * back to false.
   */
  /*******  a8735c7f-4cba-4959-9971-0ea55694618e  *******/
  async _process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { fn, resolve, reject } = this.queue.shift();

      // Calculate delay to spread requests evenly
      // e.g., 1000ms / 5 requests = 200ms gap
      const delay = this.intervalMs / this.limit;

      fn().then(resolve).catch(reject);

      // Wait for the gap before the next request in the queue
      await new Promise((r) => setTimeout(r, delay));
    }

    this.processing = false;
  }
}
/**
 * Retry predicate (centralized)
 */
function isRetryableError(err) {
  const status = err?.response?.status;

  if (!status) return true; // network / timeout

  return [429, 500, 502, 503, 504].includes(status);
}

/**
 * Factory to create executor per integration
 */
function createRequestExecutor({ name, rateLimit, intervalMs, retries = 3 }) {
  const throttle = new Throttle({
    limit: rateLimit,
    intervalMs,
  });

  return async function execute(fn, meta = {}) {
    return throttle.run(() =>
      withRetry(fn, {
        retries,
        shouldRetry: isRetryableError,
        onRetry: (err, attempt, delay) => {
          logger.warn(`${name} retry`, {
            attempt,
            delay,
            status: err?.response?.status,
            ...meta,
          });
        },
      })
    );
  };
}

const throttle = (limit, intervalMs) => new Throttle({ limit, intervalMs });

export {
  Throttle,
  throttle,
  withRetry,
  isRetryableError,
  createRequestExecutor,
};
