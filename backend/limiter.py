"""One shared rate limiter for the whole app (slowapi).

Every router must use this instance: separate Limiter objects keep separate
counters and are not registered on app.state. Set RATE_LIMIT_ENABLED=0 to turn
limits off (the test suite does this except where it tests them).
"""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

RATE_LIMIT_LOGIN = os.getenv("RATE_LIMIT_LOGIN", "5/minute")
RATE_LIMIT_JOIN_CODE = os.getenv("RATE_LIMIT_JOIN_CODE", "10/minute")

limiter = Limiter(
    key_func=get_remote_address,
    enabled=os.getenv("RATE_LIMIT_ENABLED", "1") != "0",
)
