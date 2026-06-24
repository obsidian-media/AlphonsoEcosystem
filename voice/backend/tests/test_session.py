import sys, os, asyncio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from session import register, cancel, cleanup_done


def test_register_cancels_old_task():
    async def _run():
        async def noop():
            await asyncio.sleep(100)

        t1 = asyncio.create_task(noop())
        register("s1", t1)
        assert not t1.done()

        t2 = asyncio.create_task(noop())
        register("s1", t2)  # should cancel t1
        await asyncio.sleep(0)
        assert t1.cancelled()
        t2.cancel()

    asyncio.run(_run())


def test_cancel_removes_task():
    async def _run():
        async def noop():
            await asyncio.sleep(100)

        t = asyncio.create_task(noop())
        register("s2", t)
        cancel("s2")
        await asyncio.sleep(0)
        assert t.cancelled()

    asyncio.run(_run())


def test_cancel_nonexistent():
    cancel("does-not-exist")  # must not raise


def test_cleanup_done():
    async def _run():
        async def fast():
            pass

        t = asyncio.create_task(fast())
        register("s3", t)
        await asyncio.sleep(0)
        cleanup_done()  # must not raise

    asyncio.run(_run())
