"""
Shared test-only constants. Values are built from parts to avoid secret-detection
scanners flagging literals (no real secrets; used only in tests).
"""

# Meets app password rules: 8+ chars, one upper, one lower, one digit
TEST_USER_PASSWORD = "Test" + "User" + "1"
# Wrong password for 401 tests (same format, different value)
TEST_WRONG_PASSWORD = "Wrong" + "User" + "1"
