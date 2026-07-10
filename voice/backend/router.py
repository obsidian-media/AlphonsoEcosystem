import re

# Routing patterns for each of the 9 agents.
#
# Dict order is check order — detect_agent() returns on the first match, so
# more specific agents must be checked before agents with broad/generic
# keywords (hector's "find"/"scan" previously stole matches meant for nova's
# "market opportunities" and sentinel's "security scan" because hector was
# checked first). Hector is intentionally checked last for that reason.
ROUTING_PATTERNS = {
    'jose': [
        r'\b(plan|decompose|task|schedule|delegate|orchestrat|handoff|merge|jose)\b'
    ],
    'miya': [
        r'\b(design|ui|creative|campaign|storyboard|visual|miya|brand|layout|write|blog|draft|copy|email)\b'
    ],
    'maria': [
        r'\b(audit|risk|compliance|governance|maria|check|review|policy)\b'
    ],
    'marcus': [
        r'\b(publish|release|deploy|send|distribute|marcus|github|slack)\b'
    ],
    'echo': [
        r'\b(memory|remember|save|store|recall|archive|echo|histor|bookmark)\b'
    ],
    'sentinel': [
        r'\b(scan|security|threat|vulnerability|sentinel|check|safety|permission)\b'
    ],
    'nova': [
        r'\b(opportunity|market|growth|trend|analysis|nova|score|prioritize)\b'
    ],
    'hector': [
        r'\b(research|search|find|lookup|trend|source|scan|citation|hector)\b'
    ]
}

AGENTS = ['alphonso_core', 'jose', 'hector', 'miya', 'maria', 'marcus', 'echo', 'sentinel', 'nova']

def detect_agent(text: str) -> str:
    """
    Route text to appropriate agent based on keywords.
    
    Args:
        text: User input to classify
        
    Returns:
        Agent identifier string
    """
    if not text:
        return 'alphonso_core'
    
    text_lower = text.lower()
    
    for agent, patterns in ROUTING_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                return agent
    
    return 'alphonso_core'