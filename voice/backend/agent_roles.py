"""Who owns which work (agent roles Part A, owner 2026-10-24).

The same sentences as AGENT_PERMISSION_TABLE in
src/services/jose/agentPermissionTable.ts; src/test/agentRolesVoiceSync.test.js
fails when they differ. Kept here because the installer bundles only this
folder's .py files.
"""

ROLES = {
    'jose': {
        'owns': "Planning requests, routing each step to its owner, approvals, and the closing summary.",
        'never': "Does the work itself: no writing, research or reviews.",
    },
    'alphonso': {
        'owns': "Code (front-end too), running commands, changing the project, plain questions and everyday writing such as emails and notes.",
        'never': "Brand content or design.",
    },
    'miya': {
        'owns': "Content and design: scripts, scenes, pictures, voice, music, Shorts, carousels, campaign copy, UI and UX design, and editing the finished video.",
        'never': "Writes code.",
    },
    'hector': {
        'owns': "Finding facts: research, sources, competitor material and stock footage.",
        'never': "Judges value or writes content.",
    },
    'maria': {
        'owns': "Quality, governance and risk reviews.",
        'never': "Checks security.",
    },
    'marcus': {
        'owns': "Sending and publishing approved work, and placing calls.",
        'never': "Decides what to say.",
    },
    'echo': {
        'owns': "Organising, merging and cleaning memory (other agents may save their own notes).",
        'never': "Does the other agents' work.",
    },
    'sentinel': {
        'owns': "Security and safety checks.",
        'never': "Reviews quality.",
    },
    'nova': {
        'owns': "Judging value, priority and timing from what Hector found.",
        'never': "Gathers facts.",
    },
}

# Routing patterns. Dict order is check order: detect_agent() returns on the
# first match, so agents with narrow words come before those with broad ones.
# Everyday writing (emails, notes) is Alphonso's; blog posts and other content
# are Miya's; timing and value are Nova's; finding facts (markets and
# competitors too) is Hector's, checked last.
ROUTING_PATTERNS = {
    'jose': [
        r'\b(plan|decompose|task|schedule|delegate|orchestrat|handoff|merge|jose)\b'
    ],
    'alphonso': [
        r'\b(email|letter|note|code|coding|bug|build|install|terminal|command)\b'
    ],
    'nova': [
        r'\b(opportunit\w*|growth|score|prioriti\w*|timing|nova)\b',
        r'\bwhen (should|to)\b',
    ],
    # Sending (even a post) is Marcus's, so he is checked before Miya's content words.
    'marcus': [
        r'\b(publish|release|deploy|send|distribute|marcus|github|slack|call)\b'
    ],
    'miya': [
        r'\b(design|ui|creative|campaign|storyboard|visual|miya|brand|layout|write|blog|post|draft|copy|script|video|thumbnail)\b'
    ],
    'maria': [
        r'\b(audit|risk|compliance|governance|maria|check|review|policy)\b'
    ],
    'echo': [
        r'\b(memory|remember|save|store|recall|archive|echo|histor|bookmark)\b'
    ],
    'sentinel': [
        r'\b(scan|security|threat|vulnerability|sentinel|safety|permission)\b'
    ],
    'hector': [
        r'\b(research|search|find|lookup|trend|source|scan|citation|market|competitor\w*|hector)\b'
    ],
}


def role_prompt(agent):
    """The system message for an agent: its name, what it owns and never does."""
    key = agent if agent in ROLES else 'alphonso'
    role = ROLES[key]
    name = key.capitalize()
    return (
        f"You are {name}. You own: {role['owns']} You never: {role['never']} "
        "If asked for work you don't own, say which agent does it."
    )
