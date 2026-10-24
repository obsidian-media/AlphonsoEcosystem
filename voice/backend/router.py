import re

# Routing patterns live in agent_roles.py beside each agent's role (agent roles
# Part A, 2026-10-24): work goes to the agent who owns it.
from agent_roles import ROUTING_PATTERNS  # noqa: E402

AGENTS = ['alphonso', 'jose', 'hector', 'miya', 'maria', 'marcus', 'echo', 'sentinel', 'nova']

def detect_agent(text: str) -> str:
    """
    Route text to appropriate agent based on keywords.
    
    Args:
        text: User input to classify
        
    Returns:
        Agent identifier string
    """
    if not text:
        return 'alphonso'
    
    text_lower = text.lower()
    
    for agent, patterns in ROUTING_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text_lower):
                return agent
    
    return 'alphonso_core'