"""Поток событий /api/events: участники семьи узнают об изменениях без перезагрузки."""
import time

import httpx

from .helpers import MONTH, EventStream, add_expense, add_payment, assert_error, create_family, join, set_budget


def wait_for(stream: EventStream, name: str, timeout: float = 5) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if stream.next(timeout=deadline - time.time()) == name:
            return True
    return False


def test_stream_headers_and_ready_event(api):
    anna = create_family(api)
    stream = EventStream(anna.client, anna.token)
    try:
        assert stream.response.status_code == 200
        assert stream.response.headers["content-type"].startswith("text/event-stream")
        assert stream.response.headers["cache-control"] == "no-cache"
        assert stream.next() == "ready"
    finally:
        stream.close()


def test_events_require_auth(api):
    assert_error(api.get("/api/events"), 401, "unauthorized")


def test_member_sees_changes_of_others(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    stream = EventStream(new_client(), anna.token)
    try:
        assert stream.next() == "ready"
        add_expense(boris, 100)
        assert wait_for(stream, "changed")
        set_budget(boris, 1000, {})
        assert wait_for(stream, "changed")
        p = add_payment(boris)
        assert wait_for(stream, "changed")
        boris.post(f"/api/payments/{p['id']}/paid", {"paid": True})
        assert wait_for(stream, "changed")
    finally:
        stream.close()


def test_join_and_leave_are_announced(api, new_client):
    anna = create_family(api)
    stream = EventStream(new_client(), anna.token)
    try:
        assert stream.next() == "ready"
        boris = join(new_client(), anna)
        assert wait_for(stream, "changed")
        boris.post("/api/family/leave")
        assert wait_for(stream, "changed")
    finally:
        stream.close()


def test_other_families_and_reads_do_not_trigger_events(api, new_client):
    anna = create_family(api)
    eve = create_family(new_client(), "Чужие", "Ева")
    stream = EventStream(new_client(), anna.token)
    try:
        assert stream.next() == "ready"
        add_expense(eve, 100)  # чужая семья
        anna.get("/api/state")  # чтение
        anna.post(f"/api/months/{MONTH}/purchase-check", {"amount": 10})  # POST без изменений
        anna.post("/api/expenses", {"title": "", "amount": 1, "category": "food", "date": "2026-01-01"})  # ошибка 422
        assert not wait_for(stream, "changed", timeout=2.5)
    finally:
        stream.close()


def test_stream_stays_open_with_heartbeats(api, base_url):
    """Сервер присылает комментарии `: ping`, чтобы прокси не закрывали простаивающее соединение."""
    anna = create_family(api)
    with httpx.Client(base_url=base_url, timeout=httpx.Timeout(10, read=None)) as client:
        with client.stream("GET", "/api/events", headers={"Authorization": f"Bearer {anna.token}"}) as r:
            lines = r.iter_lines()
            seen = []
            deadline = time.time() + 25
            for line in lines:
                seen.append(line)
                if line.startswith(": ping") or time.time() > deadline:
                    break
    assert any(line.startswith(": ping") for line in seen)
