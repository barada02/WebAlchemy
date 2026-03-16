"""Standalone PyAutoGUI smoke test script.

Run this outside the LiveAgent backend to validate local mouse control:
    python pyautogui_smoke_test.py
"""

from __future__ import annotations

import sys
import time


def main() -> int:
    try:
        import pyautogui
    except ImportError:
        print("[ERROR] pyautogui is not installed. Install with: pip install pyautogui")
        return 1

    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.2

    screen_width, screen_height = pyautogui.size()
    center_x = screen_width // 2
    center_y = screen_height // 2

    print("PyAutoGUI smoke test starting...")
    print(f"Screen size: {screen_width}x{screen_height}")
    print("Move mouse to any screen corner to trigger FAILSAFE and abort.")
    print("Starting in 3 seconds...")
    time.sleep(3)

    try:
        print("Moving to center...")
        pyautogui.moveTo(center_x, center_y, duration=0.4)

        print("Moving in a small square pattern...")
        offsets = [(120, 0), (120, 120), (0, 120), (0, 0)]
        for offset_x, offset_y in offsets:
            pyautogui.moveTo(center_x + offset_x, center_y + offset_y, duration=0.35)

        answer = input("Do you want to perform a single LEFT click at current cursor position? (y/n): ").strip().lower()
        if answer == "y":
            pyautogui.click(button="left")
            print("Left click executed.")
        else:
            print("Click skipped.")

        print("[OK] PyAutoGUI move/click smoke test completed.")
        return 0
    except pyautogui.FailSafeException:
        print("[ABORTED] Fail-safe triggered by moving mouse to a corner.")
        return 2
    except Exception as exc:
        print(f"[ERROR] Smoke test failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
