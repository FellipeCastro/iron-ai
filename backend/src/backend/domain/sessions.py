from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

DAY_ROLLOVER_HOUR = 4


def local_session_date(moment: datetime, tz_name: str) -> date:
    """Dia local da sessão. Antes das 04:00 ainda conta como o dia anterior."""
    local = moment.astimezone(ZoneInfo(tz_name))
    return (local - timedelta(hours=DAY_ROLLOVER_HOUR)).date()
