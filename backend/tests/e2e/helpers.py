"""Короткие шаги сценариев, чтобы тесты читались как сценарии, а не как HTTP."""
import queue
import threading
import uuid
from dataclasses import dataclass

import httpx

from app.clock import current_month_key, today

MONTH = current_month_key()
TODAY = today().isoformat()
PLANS = {"food": 30000, "housing": 40000, "transport": 10000, "kids": 10000, "other": 5000}


def auth(token: str, key: str | None = None) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    if key:
        headers["Idempotency-Key"] = key
    return headers


def key() -> str:
    return uuid.uuid4().hex


@dataclass
class Member:
    token: str
    id: str
    family_id: str
    invite_code: str
    client: httpx.Client

    @property
    def h(self) -> dict:
        return auth(self.token)

    def get(self, path: str, **kw) -> httpx.Response:
        return self.client.get(path, headers=self.h, **kw)

    def post(self, path: str, json=None, idem: str | None = None) -> httpx.Response:
        return self.client.post(path, headers=auth(self.token, idem), json=json)

    def put(self, path: str, json=None, idem: str | None = None) -> httpx.Response:
        return self.client.put(path, headers=auth(self.token, idem), json=json)

    def delete(self, path: str) -> httpx.Response:
        return self.client.delete(path, headers=self.h)


def _member(client: httpx.Client, body: dict) -> Member:
    return Member(
        token=body["token"],
        id=body["currentUserId"],
        family_id=body["family"]["id"],
        invite_code=body["family"]["inviteCode"],
        client=client,
    )


def create_family(client: httpx.Client, family: str = "Ивановы", user: str = "Анна") -> Member:
    r = client.post("/api/families", json={"familyName": family, "userName": user})
    assert r.status_code == 201, r.text
    return _member(client, r.json())


def join(client: httpx.Client, code: "Member | str", user: str = "Борис") -> Member:
    """Вход по коду. Передан взрослый — входим по коду его семьи, и он сразу подтверждает вход;
    передан код — участник остаётся ждать подтверждения (docs/FEATURES.md §1)."""
    approver = code if isinstance(code, Member) else None
    r = client.post(f"/api/invites/{approver.invite_code if approver else code}/join", json={"userName": user})
    assert r.status_code == 201, r.text
    member = _member(client, r.json())
    return approve(approver, member) if approver else member


def approve(parent: Member, member: Member) -> Member:
    r = parent.post(f"/api/family/members/{member.id}/approve")
    assert r.status_code == 200, r.text
    member.invite_code = member.get("/api/family").json()["inviteCode"]  # до подтверждения код не виден
    return member


def until_limited(send, limit: int) -> list[httpx.Response]:
    """Отправлять запросы, пока не придёт 429. Раньше лимита 429 быть не должно; после — сразу или почти сразу:
    если пачка пришлась на стык минут, скользящее окно учитывает прошлую минуту с весом чуть меньше 1
    и пропускает несколько лишних запросов. Возвращает ответы до лимита; последний ответ — 429."""
    responses = [send(i) for i in range(limit)]
    assert all(r.status_code != 429 for r in responses), [r.status_code for r in responses]
    for i in range(limit, limit + limit // 4 + 5):
        r = send(i)
        responses.append(r)
        if r.status_code == 429:
            return responses
    raise AssertionError(f"нет 429 после {len(responses)} запросов при лимите {limit}")


def start_demo(client: httpx.Client) -> Member:
    r = client.post("/api/demo")
    assert r.status_code == 201, r.text
    return _member(client, r.json())


def set_budget(m: Member, total: float = 100000, plans: dict | None = None, month: str = MONTH) -> dict:
    r = m.put(f"/api/budgets/{month}", {"totalAmount": total, "categoryPlans": PLANS if plans is None else plans})
    assert r.status_code == 200, r.text
    return r.json()


def add_expense(m: Member, amount: float = 100, category: str = "food", title: str = "Покупка", date: str = TODAY) -> dict:
    r = m.post("/api/expenses", {"title": title, "amount": amount, "category": category, "date": date})
    assert r.status_code == 201, r.text
    return r.json()


def add_payment(m: Member, amount: float = 1000, category: str = "housing", title: str = "Аренда",
                due: str | None = None) -> dict:
    r = m.post("/api/payments", {"title": title, "amount": amount, "category": category, "dueDate": due or TODAY})
    assert r.status_code == 201, r.text
    return r.json()


def summary(m: Member, month: str = MONTH) -> dict:
    r = m.get(f"/api/months/{month}/summary")
    assert r.status_code == 200, r.text
    return r.json()


def category(s: dict, key_: str) -> dict:
    return next(c for c in s["categories"] if c["key"] == key_)


def assert_error(r: httpx.Response, status: int, code: str | None = None, field: str | None = None,
                 message: str | None = None) -> dict:
    assert r.status_code == status, f"{r.status_code} {r.text}"
    error = r.json()["error"]
    assert set(error) == {"code", "message", "field"}
    assert error["message"]
    if code:
        assert error["code"] == code
    if field is not None:
        assert error["field"] == field
    if message:
        assert error["message"] == message
    return error


class EventStream:
    """Читает SSE /api/events в фоновом потоке; события складываются в очередь."""

    def __init__(self, client: httpx.Client, token: str):
        self.events: queue.Queue = queue.Queue()
        self._cm = client.stream("GET", "/api/events", headers=auth(token), timeout=httpx.Timeout(15, read=None))
        self.response = self._cm.__enter__()
        self._thread = threading.Thread(target=self._read, daemon=True)
        self._thread.start()

    def _read(self) -> None:
        name = None
        try:
            for line in self.response.iter_lines():
                if line.startswith("event: "):
                    name = line[7:]
                elif line.startswith("data: ") and name:
                    self.events.put(name)
                    name = None
        except Exception:
            pass

    def next(self, timeout: float = 5) -> str | None:
        try:
            return self.events.get(timeout=timeout)
        except queue.Empty:
            return None

    def close(self) -> None:
        self.response.close()
        try:
            self._cm.__exit__(None, None, None)
        except Exception:
            pass


def add_child(parent: Member, client: httpx.Client, name: str = "Соня") -> Member:
    """Ребёнок входит по детскому коду семьи, взрослый подтверждает."""
    r = parent.post("/api/family/child-invites")
    assert r.status_code == 200, r.text
    return approve(parent, join(client, r.json()["code"], name))


def set_allowance(parent: Member, child: Member, amount: float = 1000, period: str = "week") -> dict:
    r = parent.put(f"/api/family/members/{child.id}/allowance", {"amount": amount, "period": period})
    assert r.status_code == 200, r.text
    return r.json()


def receipt_qr(amount: str = "1250.50", fp: str = "3826443159", when: str = "20261021T1530") -> str:
    return f"t={when}&s={amount}&fn=7380440700076549&i=41552&fp={fp}&n=1"
