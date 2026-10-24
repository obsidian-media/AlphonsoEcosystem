import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from router import detect_agent, AGENTS


def test_all_agents_defined():
    expected = {"alphonso", "jose", "hector", "miya", "maria", "marcus", "echo", "sentinel", "nova"}
    assert set(AGENTS) == expected


def test_default_agent():
    assert detect_agent("hello there") == "alphonso_core"


def test_hector_routing():
    assert detect_agent("search for climate change news") == "hector"
    assert detect_agent("find the latest reports") == "hector"


def test_miya_and_alphonso_routing():
    assert detect_agent("write me a blog post") == "miya"
    assert detect_agent("draft an email") == "alphonso"  # everyday writing is Alphonso's (2026-10-24)


def test_jose_routing():
    assert detect_agent("create a task for tomorrow") == "jose"
    assert detect_agent("plan the sprint") == "jose"


def test_sentinel_routing():
    assert detect_agent("scan for security vulnerabilities") == "sentinel"


def test_nova_routing():
    assert detect_agent("find market opportunities") == "nova"


def test_echo_routing():
    assert detect_agent("remember what we discussed") == "echo"


def test_marcus_routing():
    assert detect_agent("publish this to twitter") == "marcus"


def test_maria_routing():
    assert detect_agent("review for compliance") == "maria"


# Agent roles Part A (2026-10-24): route by who owns the work.
def test_everyday_writing_goes_to_alphonso():
    assert detect_agent("draft an email to my landlord") == "alphonso"


def test_market_research_goes_to_hector():
    assert detect_agent("research the market for vegan snacks") == "hector"


def test_timing_goes_to_nova():
    assert detect_agent("when should I post this") == "nova"


def test_sending_a_post_goes_to_marcus():
    assert detect_agent("send the post to slack") == "marcus"
    assert detect_agent("write a blog post") == "miya"
