"""Mouse automation tools for the live agent."""

from __future__ import annotations


def move_mouse_and_click(
    x: int,
    y: int,
    click: bool = True,
    button: str = "left",
    duration_seconds: float = 0.1,
) -> dict:
    """Move mouse to screen coordinates and optionally click.

    Args:
        x: Screen X coordinate.
        y: Screen Y coordinate.
        click: Whether to perform a click after moving.
        button: Mouse button to click (left, right, middle).
        duration_seconds: Time for mouse movement animation.

    Returns:
        A dictionary with the action outcome.
    """
    if button not in {"left", "right", "middle"}:
        return {
            "ok": False,
            "error": "Invalid button. Use left, right, or middle.",
        }

    try:
        import pyautogui
    except ImportError:
        return {
            "ok": False,
            "error": "pyautogui is not installed.",
            "hint": "Install with: pip install pyautogui",
        }

    try:
        pyautogui.moveTo(x, y, duration=max(0.0, duration_seconds))
        action = "moved"

        if click:
            pyautogui.click(x=x, y=y, button=button)
            action = f"clicked_{button}"

        return {
            "ok": True,
            "action": action,
            "x": x,
            "y": y,
            "click": click,
            "button": button,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }