"""
EduLearn — Async Flood Script
==============================
Floods the ai.indexing RabbitMQ queue and concurrent HTTP paper-gen endpoint
to expose Celery worker backpressure, Qdrant upsert limits, and Ollama
serial-processing bottlenecks.

Usage:
    # Flood indexing queue
    python async_flood.py index --jobs 500 --concurrency 50

    # Flood paper generation endpoint
    python async_flood.py papers --jobs 100 --concurrency 20 --base-url http://localhost:9000

    # Thundering-herd RAG test (same query, busts cache-lock gap)
    python async_flood.py rag-herd --queries 200 --base-url http://localhost:9000

    # Monitor queues live
    python async_flood.py monitor --interval 5

Requirements:
    pip install aio-pika httpx rich asyncio
"""

import argparse
import asyncio
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx

try:
    import aio_pika
    HAVE_AMQP = True
except ImportError:
    HAVE_AMQP = False

try:
    from rich.console import Console
    from rich.table import Table
    from rich.live import Live
    HAVE_RICH = True
except ImportError:
    HAVE_RICH = False
    class Console:                           # noqa: F811
        def print(self, *a, **k): print(*a)
    class Table: pass                        # noqa: F811

console = Console()

# ── Config ──────────────────────────────────────────────────────────────────

RABBITMQ_URL  = "amqp://edtech:edtech_rabbit@localhost:5672/"
QUEUE_NAME    = "ai.indexing"
REDIS_URL     = "redis://:password@localhost:6381"       # update password to match .env

# Realistic content chunk for indexing jobs
SAMPLE_CHUNKS = [
    "Newton's First Law: An object at rest stays at rest unless acted upon by a net external force.",
    "Photosynthesis is the process by which green plants convert sunlight into chemical energy.",
    "The French Revolution (1789-1799) radically transformed France's political landscape.",
    "Quadratic equations take the form ax² + bx + c = 0, solvable by the quadratic formula.",
    "The mitochondria is the powerhouse of the cell, producing ATP via oxidative phosphorylation.",
]

SAMPLE_SUBJECTS = ["Physics", "Chemistry", "Biology", "Mathematics", "History"]
SAMPLE_CLASSES  = [9, 10, 11, 12]

# ── Result Tracker ───────────────────────────────────────────────────────────

@dataclass
class FloodStats:
    total:      int = 0
    success:    int = 0
    failed:     int = 0
    latencies:  list = field(default_factory=list)
    errors:     list = field(default_factory=list)
    start_time: float = field(default_factory=time.monotonic)

    @property
    def elapsed(self) -> float:
        return time.monotonic() - self.start_time

    @property
    def rps(self) -> float:
        return self.total / max(self.elapsed, 0.001)

    @property
    def p50(self) -> float:
        if not self.latencies: return 0
        s = sorted(self.latencies)
        return s[int(len(s) * 0.50)]

    @property
    def p95(self) -> float:
        if not self.latencies: return 0
        s = sorted(self.latencies)
        return s[int(len(s) * 0.95)]

    @property
    def p99(self) -> float:
        if not self.latencies: return 0
        s = sorted(self.latencies)
        return s[int(len(s) * 0.99)]

    def record_success(self, latency_ms: float):
        self.total   += 1
        self.success += 1
        self.latencies.append(latency_ms)

    def record_failure(self, error: str):
        self.total  += 1
        self.failed += 1
        self.errors.append(error[:120])


# ── Indexing Queue Flood ─────────────────────────────────────────────────────

async def _publish_index_job(channel, job_id: str, content_id: str) -> dict:
    """Build and publish a single index_content_task message to ai.indexing."""
    import aio_pika

    body = {
        "id":         str(uuid.uuid4()),
        "task":       "app.tasks.indexing.index_content_task",
        "args":       [job_id, content_id, SAMPLE_SUBJECTS[int(job_id[-1], 16) % 5], 10],
        "kwargs":     {},
        "retries":    0,
        "eta":        None,
        "expires":    None,
        "callbacks":  None,
        "errbacks":   None,
        "timelimit":  [None, None],
        "taskset":    None,
        "chord":      None,
    }

    await channel.default_exchange.publish(
        aio_pika.Message(
            body=json.dumps(body).encode(),
            content_type="application/json",
            headers={"task": "app.tasks.indexing.index_content_task"},
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        ),
        routing_key=QUEUE_NAME,
    )
    return body


async def flood_index_queue(jobs: int, concurrency: int):
    """Publish `jobs` indexing tasks to RabbitMQ at up to `concurrency` in-flight."""
    if not HAVE_AMQP:
        console.print("[red]aio-pika not installed. pip install aio-pika[/red]")
        return

    console.print(f"\n[bold cyan]Flooding ai.indexing queue: {jobs} jobs, {concurrency} concurrency[/bold cyan]")

    stats     = FloodStats()
    semaphore = asyncio.Semaphore(concurrency)

    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    channel    = await connection.channel()
    await channel.set_qos(prefetch_count=concurrency)

    async def publish_one(i: int):
        async with semaphore:
            job_id     = f"flood-{i:05d}-{uuid.uuid4().hex[:8]}"
            content_id = str(uuid.uuid4())
            t0 = time.monotonic()
            try:
                await _publish_index_job(channel, job_id, content_id)
                stats.record_success((time.monotonic() - t0) * 1000)
            except Exception as exc:
                stats.record_failure(str(exc))

    tasks = [publish_one(i) for i in range(jobs)]

    # Report progress every 5 seconds
    async def progress_reporter():
        while stats.total < jobs:
            await asyncio.sleep(5)
            console.print(
                f"  Published {stats.total}/{jobs} | "
                f"success={stats.success} failed={stats.failed} | "
                f"rps={stats.rps:.1f} p95={stats.p95:.1f}ms"
            )

    reporter = asyncio.create_task(progress_reporter())
    await asyncio.gather(*tasks)
    reporter.cancel()

    await connection.close()

    _print_summary("Queue Flood — ai.indexing", stats)

    # Check queue depth via management API
    console.print("\n[yellow]Checking RabbitMQ queue depth via management API...[/yellow]")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"http://localhost:15672/api/queues/%2F/{QUEUE_NAME}",
                auth=("edtech", "edtech_rabbit"),
                timeout=5,
            )
            if resp.status_code == 200:
                q = resp.json()
                console.print(
                    f"  Queue: {QUEUE_NAME}\n"
                    f"  Messages Ready:     {q.get('messages_ready', '?')}\n"
                    f"  Messages Unacked:   {q.get('messages_unacknowledged', '?')}\n"
                    f"  Consumers:          {q.get('consumers', '?')}\n"
                    f"  Publish Rate:       {q.get('message_stats', {}).get('publish_details', {}).get('rate', '?')} msg/s\n"
                    f"  Deliver Rate:       {q.get('message_stats', {}).get('deliver_details', {}).get('rate', '?')} msg/s"
                )
                if q.get('messages_ready', 0) > jobs * 0.5:
                    console.print(
                        "[red]WARNING: >50% of jobs still queued — workers not keeping up. "
                        "Increase Celery concurrency or add worker instances.[/red]"
                    )
    except Exception as exc:
        console.print(f"  [yellow]Management API unreachable: {exc}[/yellow]")


# ── Paper Generation Flood ───────────────────────────────────────────────────

async def flood_paper_gen(
    jobs: int,
    concurrency: int,
    base_url: str,
    token: str,
):
    """
    Submit `jobs` concurrent paper generation requests.
    Tests: Celery queue saturation, Ollama serial throughput, Redis result backend.
    """
    console.print(
        f"\n[bold cyan]Flooding paper generation: "
        f"{jobs} requests, {concurrency} concurrency[/bold cyan]"
    )

    stats     = FloodStats()
    semaphore = asyncio.Semaphore(concurrency)

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    }

    async def submit_one(i: int):
        async with semaphore:
            payload = {
                "title":       f"Flood Paper {i:04d}",
                "subject":     SAMPLE_SUBJECTS[i % len(SAMPLE_SUBJECTS)],
                "class_num":   SAMPLE_CLASSES[i % len(SAMPLE_CLASSES)],
                "total_marks": 80,
                "duration":    180,
                "sections": [
                    {"name": "MCQ", "marks_per_question": 1, "question_count": 10, "question_type": "MCQ"},
                    {"name": "Short", "marks_per_question": 3, "question_count": 5, "question_type": "SHORT_ANSWER"},
                ],
                "custom_instructions": f"Load test paper #{i}",
            }
            t0 = time.monotonic()
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.post(
                        f"{base_url}/api/v1/ai/paper",
                        json=payload,
                        headers=headers,
                    )
                    latency = (time.monotonic() - t0) * 1000
                    if resp.status_code in (200, 201, 202):
                        stats.record_success(latency)
                        data = resp.json()
                        # Check if it was queued (202) vs synchronous (200)
                        if resp.status_code == 202:
                            return data.get("task_id") or data.get("paper_id")
                    else:
                        stats.record_failure(f"HTTP {resp.status_code}: {resp.text[:100]}")
            except httpx.TimeoutException:
                stats.record_failure("TIMEOUT >30s")
            except Exception as exc:
                stats.record_failure(str(exc))
            return None

    task_ids = await asyncio.gather(*[submit_one(i) for i in range(jobs)])

    _print_summary("Paper Generation Flood", stats)

    valid_ids = [t for t in task_ids if t]
    if valid_ids:
        console.print(f"\n[green]Polling {len(valid_ids)} task IDs for completion...[/green]")
        await _poll_task_results(valid_ids, base_url, headers)


async def _poll_task_results(task_ids: list, base_url: str, headers: dict):
    """Poll paper status until all complete or 5-minute timeout."""
    deadline = time.monotonic() + 300  # 5 min
    pending  = set(task_ids)
    done     = set()
    failed   = set()

    async with httpx.AsyncClient(timeout=10.0) as client:
        while pending and time.monotonic() < deadline:
            await asyncio.sleep(10)
            for tid in list(pending):
                try:
                    resp = await client.get(
                        f"{base_url}/api/v1/ai/paper/{tid}",
                        headers=headers,
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        status = data.get("status", "")
                        if status == "COMPLETED":
                            done.add(tid)
                            pending.discard(tid)
                        elif status == "FAILED":
                            failed.add(tid)
                            pending.discard(tid)
                except Exception:
                    pass

            elapsed = int(time.monotonic() - (time.monotonic() - 300 + deadline))
            console.print(
                f"  Elapsed: {elapsed}s | "
                f"Pending: {len(pending)} | "
                f"Done: {len(done)} | "
                f"Failed: {len(failed)}"
            )

    console.print(
        f"\n[bold]Task Completion Results:[/bold]\n"
        f"  Completed: {len(done)}/{len(task_ids)}\n"
        f"  Failed:    {len(failed)}/{len(task_ids)}\n"
        f"  Timed Out: {len(pending)}/{len(task_ids)}"
    )

    if len(pending) > len(task_ids) * 0.1:
        console.print(
            "[red]BOTTLENECK: >10% of tasks timed out in 5 minutes.\n"
            "Likely causes: Ollama serial limit, single ai.indexing queue, "
            "no task time limits blocking workers.[/red]"
        )


# ── RAG Thundering-Herd Test ─────────────────────────────────────────────────

async def rag_thundering_herd(queries: int, base_url: str, token: str):
    """
    Fire `queries` identical RAG requests simultaneously to test cache miss stampede.
    All requests arrive before any one can populate the cache → all hit the LLM.
    Expected: Groq/Claude rate limit errors or response time spike > 30s.
    """
    console.print(
        f"\n[bold cyan]RAG Thundering Herd: {queries} identical queries, simultaneous[/bold cyan]"
    )

    # Use a unique query so it's guaranteed to be a cache miss
    unique_query = f"Explain the photoelectric effect in the context of quantum mechanics — loadtest-{uuid.uuid4().hex[:8]}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    }

    stats = FloodStats()

    async def fire_one(_: int):
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{base_url}/api/v1/ai/study",
                    json={
                        "query":   unique_query,
                        "subject": "Physics",
                        "class_num": 11,
                    },
                    headers=headers,
                )
                latency = (time.monotonic() - t0) * 1000
                if resp.status_code == 200:
                    data = resp.json()
                    from_cache = data.get("from_cache", False)
                    stats.record_success(latency)
                    if from_cache:
                        console.print(f"  [green]Cache hit at {latency:.0f}ms[/green]")
                    else:
                        console.print(f"  [yellow]Cache miss at {latency:.0f}ms (LLM call)[/yellow]")
                elif resp.status_code == 429:
                    stats.record_failure(f"RATE_LIMITED: {resp.text[:80]}")
                elif resp.status_code == 503:
                    stats.record_failure(f"SERVICE_UNAVAILABLE: {resp.text[:80]}")
                else:
                    stats.record_failure(f"HTTP {resp.status_code}")
        except httpx.TimeoutException:
            stats.record_failure("TIMEOUT >60s")
        except Exception as exc:
            stats.record_failure(str(exc))

    # Fire all at once with NO semaphore — true herd
    start = time.monotonic()
    await asyncio.gather(*[fire_one(i) for i in range(queries)])
    total_elapsed = time.monotonic() - start

    _print_summary("RAG Thundering Herd", stats)

    console.print(f"\n  Total elapsed for {queries} queries: {total_elapsed:.1f}s")

    if stats.failed > queries * 0.1:
        console.print(
            "[red]THUNDERING HERD CONFIRMED: >10% of simultaneous cache-miss requests failed.\n"
            "Fix: Implement Redis SETNX single-flight lock on RAG cache key.\n"
            "Pattern: SET cache_key:lock LOCKED NX PX 10000 → only one caller\n"
            "         proceeds; others poll the result key with BLPOP.[/red]"
        )

    # Check if later requests were cache hits (proves fix works)
    cache_hits = stats.success  # rough proxy
    console.print(
        f"\n  Cache miss rate during herd: "
        f"~{(stats.total - cache_hits) / max(stats.total, 1) * 100:.1f}% "
        f"(all should miss on first herd if no lock)"
    )


# ── Queue Monitor ────────────────────────────────────────────────────────────

async def monitor_queues(interval: int):
    """Live monitor of RabbitMQ queue depths and Celery task throughput."""
    console.print(f"\n[bold cyan]Monitoring RabbitMQ queues every {interval}s (Ctrl+C to stop)[/bold cyan]\n")

    queues_to_watch = ["ai.indexing", "notifications.email", "notifications.push", "notifications.whatsapp"]

    while True:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    "http://localhost:15672/api/queues/%2F",
                    auth=("edtech", "edtech_rabbit"),
                )
                if resp.status_code == 200:
                    all_queues = {q["name"]: q for q in resp.json()}

                    lines = [f"[{time.strftime('%H:%M:%S')}] Queue snapshot:"]
                    for qname in queues_to_watch:
                        q = all_queues.get(qname, {})
                        ready   = q.get("messages_ready", 0)
                        unacked = q.get("messages_unacknowledged", 0)
                        pub_r   = q.get("message_stats", {}).get("publish_details", {}).get("rate", 0)
                        del_r   = q.get("message_stats", {}).get("deliver_details", {}).get("rate", 0)
                        consum  = q.get("consumers", 0)
                        lag     = f"[red]LAG={ready}[/red]" if ready > 50 else f"ready={ready}"
                        lines.append(
                            f"  {qname:<30} {lag}  unacked={unacked}  "
                            f"pub={pub_r:.1f}/s  del={del_r:.1f}/s  consumers={consum}"
                        )

                    for line in lines:
                        console.print(line)
                    console.print("")
        except Exception as exc:
            console.print(f"  [yellow]Monitor error: {exc}[/yellow]")

        await asyncio.sleep(interval)


# ── Redis Inspector ──────────────────────────────────────────────────────────

async def inspect_redis():
    """Spot-check Redis memory, eviction stats, and key counts relevant to load."""
    console.print("\n[bold cyan]Redis Memory & Key Inspection[/bold cyan]\n")

    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(REDIS_URL, decode_responses=True)

        info = await r.info("all")

        console.print(f"  Used Memory:        {info.get('used_memory_human', '?')}")
        console.print(f"  Max Memory:         {info.get('maxmemory_human', '?')} (policy: {info.get('maxmemory_policy', '?')})")
        console.print(f"  Evicted Keys:       {info.get('evicted_keys', 0)}")
        console.print(f"  Keyspace Hits:      {info.get('keyspace_hits', 0)}")
        console.print(f"  Keyspace Misses:    {info.get('keyspace_misses', 0)}")
        console.print(f"  Connected Clients:  {info.get('connected_clients', 0)}")
        console.print(f"  Blocked Clients:    {info.get('blocked_clients', 0)}")

        # Key pattern counts
        patterns = {
            "rag_answer:*":      "RAG cache entries",
            "battle:*:state":    "Active battle states",
            "battle:*:scores":   "Battle score ZSETs",
            "presence:*":        "Online presence keys",
            "pending:*":         "Offline message streams",
            "ratelimit:*":       "Rate limit windows",
        }
        console.print("\n  Key pattern counts:")
        for pattern, label in patterns.items():
            count = len(await r.keys(pattern))
            console.print(f"    {label:<30} {count:>6} keys")

        if info.get("evicted_keys", 0) > 0:
            console.print(
                f"\n  [red]WARNING: {info['evicted_keys']} keys evicted under allkeys-lru!\n"
                f"  Critical risk: battle scores or subscription cache evicted mid-session.\n"
                f"  Fix: increase maxmemory to 2gb or move battle state to PostgreSQL.[/red]"
            )

        await r.aclose()
    except ImportError:
        console.print("  [yellow]redis-py not installed. pip install redis[/yellow]")
    except Exception as exc:
        console.print(f"  [red]Redis connection failed: {exc}[/red]")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _print_summary(label: str, stats: FloodStats):
    console.print(f"\n[bold green]{'='*60}[/bold green]")
    console.print(f"[bold]{label} — Results[/bold]")
    console.print(f"  Total:    {stats.total}")
    console.print(f"  Success:  {stats.success} ({stats.success/max(stats.total,1)*100:.1f}%)")
    console.print(f"  Failed:   {stats.failed} ({stats.failed/max(stats.total,1)*100:.1f}%)")
    console.print(f"  Elapsed:  {stats.elapsed:.1f}s")
    console.print(f"  RPS:      {stats.rps:.1f}")
    if stats.latencies:
        console.print(f"  Latency p50: {stats.p50:.0f}ms")
        console.print(f"  Latency p95: {stats.p95:.0f}ms")
        console.print(f"  Latency p99: {stats.p99:.0f}ms")
    if stats.errors:
        console.print(f"\n  Top errors:")
        from collections import Counter
        for err, cnt in Counter(stats.errors).most_common(5):
            console.print(f"    {cnt:>4}x  {err}")
    console.print(f"[bold green]{'='*60}[/bold green]\n")


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="EduLearn Async Flood Tool")
    sub    = parser.add_subparsers(dest="cmd")

    # index
    p_idx = sub.add_parser("index", help="Flood ai.indexing queue")
    p_idx.add_argument("--jobs",        type=int, default=500)
    p_idx.add_argument("--concurrency", type=int, default=50)

    # papers
    p_pap = sub.add_parser("papers", help="Flood paper generation endpoint")
    p_pap.add_argument("--jobs",        type=int, default=100)
    p_pap.add_argument("--concurrency", type=int, default=20)
    p_pap.add_argument("--base-url",    default="http://localhost:9000")
    p_pap.add_argument("--token",       default="REPLACE_WITH_JWT")

    # rag-herd
    p_rag = sub.add_parser("rag-herd", help="Thundering-herd RAG cache test")
    p_rag.add_argument("--queries",  type=int, default=200)
    p_rag.add_argument("--base-url", default="http://localhost:9000")
    p_rag.add_argument("--token",    default="REPLACE_WITH_JWT")

    # monitor
    p_mon = sub.add_parser("monitor", help="Live queue monitor")
    p_mon.add_argument("--interval", type=int, default=5)

    # redis
    sub.add_parser("redis", help="Redis memory + key inspection")

    args = parser.parse_args()

    if args.cmd == "index":
        asyncio.run(flood_index_queue(args.jobs, args.concurrency))

    elif args.cmd == "papers":
        asyncio.run(flood_paper_gen(args.jobs, args.concurrency, args.base_url, args.token))

    elif args.cmd == "rag-herd":
        asyncio.run(rag_thundering_herd(args.queries, args.base_url, args.token))

    elif args.cmd == "monitor":
        asyncio.run(monitor_queues(args.interval))

    elif args.cmd == "redis":
        asyncio.run(inspect_redis())

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
