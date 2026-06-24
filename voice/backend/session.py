import asyncio

sessions = {}

def register(session_id, task):
    old = sessions.get(session_id)
    if old and not old.done():
        old.cancel()
    sessions[session_id] = task
