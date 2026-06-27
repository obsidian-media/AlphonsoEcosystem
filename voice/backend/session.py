import asyncio

sessions = {}

def register(session_id, task):
    old = sessions.get(session_id)
    if old and not old.done():
        old.cancel()
    sessions[session_id] = task

def cancel(session_id):
    task = sessions.get(session_id)
    if task and not task.done():
        task.cancel()

def cleanup_done():
    done = [sid for sid, t in sessions.items() if t.done()]
    for sid in done:
        del sessions[sid]
