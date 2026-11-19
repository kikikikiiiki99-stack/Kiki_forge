"""Turn raw LLM provider failures into a message an admin can act on."""

CREDITS_MSG = ("AI credits for this app are used up. Add balance to your Emergent Universal Key "
               "(Profile → Universal Key → Add balance), then try again.")


def is_budget_error(e: Exception) -> bool:
    s = str(e).lower()
    return "budget has been exceeded" in s or "budget_exceeded" in s or "insufficient_credits" in s


def friendly_ai_error(e: Exception) -> str:
    if is_budget_error(e):
        return CREDITS_MSG
    return f"The AI is unavailable right now. Please try again shortly. ({str(e)[:120]})"
