"""Одновременные запросы: двойные клики, два участника жмут одно и то же."""
from concurrent.futures import ThreadPoolExecutor

from .helpers import MONTH, TODAY, add_payment, create_family, join, key


def run_parallel(n: int, fn):
    with ThreadPoolExecutor(max_workers=n) as pool:
        return list(pool.map(lambda _: fn(), range(n)))


def test_parallel_requests_with_same_idempotency_key_create_one_expense(api):
    anna = create_family(api)
    k = key()
    body = {"title": "Двойной клик", "amount": 99, "category": "food", "date": TODAY}
    responses = run_parallel(6, lambda: anna.post("/api/expenses", body, idem=k))
    ok = [r for r in responses if r.status_code == 201]
    assert ok, [r.text for r in responses]
    assert {r.json()["id"] for r in ok} == {ok[0].json()["id"]}
    assert all(r.status_code in (201, 409) for r in responses)
    assert len(anna.get("/api/expenses").json()) == 1


def test_parallel_budget_creation_for_new_month(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    members = [anna, boris] * 4
    with ThreadPoolExecutor(max_workers=len(members)) as pool:
        responses = list(pool.map(
            lambda m: m.put(f"/api/budgets/{MONTH}", {"totalAmount": 1000, "categoryPlans": {}}), members
        ))
    assert all(r.status_code == 200 for r in responses), [r.text for r in responses]
    assert len(anna.get("/api/budgets").json()) == 1


def test_parallel_mark_paid_creates_single_expense(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    p = add_payment(anna, 500)
    members = [anna, boris] * 3
    with ThreadPoolExecutor(max_workers=len(members)) as pool:
        responses = list(pool.map(lambda m: m.post(f"/api/payments/{p['id']}/paid", {"paid": True}), members))
    assert all(r.status_code in (200, 409) for r in responses), [r.text for r in responses]
    assert len(anna.get("/api/expenses").json()) == 1
    assert anna.get("/api/payments").json()[0]["status"] == "paid"


def test_parallel_pay_now_from_two_replicas_creates_one_expense(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    anna.post("/api/account/contributions", {"amount": 500}, idem=key())
    payment = add_payment(anna, 500)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda member: member.post(f"/api/payments/{payment['id']}/pay"),
                                  (anna, boris)))
    assert all(response.status_code == 200 for response in responses), [response.text for response in responses]
    assert len(anna.get("/api/expenses").json()) == 1
