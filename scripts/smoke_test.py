#!/usr/bin/env python3
"""
End-to-end smoke test for a RUNNING StockPilot backend (no dependencies, Python 3.8+ standard library only).

    docker compose up --build          # or run the backend with the demo seed
    python3 scripts/smoke_test.py      # optional: API_URL=http://localhost:8080

It exercises the real HTTP API with the demo accounts and checks the business invariants that matter most:
authentication, role-based access, stock changes from sales/voids/purchases, rollback on insufficient stock,
discount permissions, validation errors and report arithmetic. Exit code 0 = everything passed.
Needs the demo seed (admin / manager / cashier). It creates a few sales and one purchase order in the database.
"""
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("API_URL", "http://localhost:8080").rstrip("/")
results = []


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None
        except ValueError:
            return e.code, None


def check(name, condition, detail=""):
    results.append(bool(condition))
    print(("PASS  " if condition else "FAIL  ") + name + (f"   [{detail}]" if detail and not condition else ""))


def login(user, password):
    status, body = call("POST", "/api/auth/login", {"username": user, "password": password})
    return status, body


def stock(token, pid):
    return call("GET", f"/api/products/{pid}", token=token)[1]["quantity"]


def main():
    status, body = call("GET", "/actuator/health")
    check("health endpoint is up", status == 200 and body and body.get("status") == "UP", f"{status} {body}")

    # ---- authentication
    status, body = login("admin", "wrong-password-1")
    check("wrong password -> 401 generic message", status == 401 and body["message"] == "Invalid username or password", f"{status}")
    status, body = login("nobody-here", "whatever-1")
    check("unknown user -> same 401 message", status == 401 and body["message"] == "Invalid username or password", f"{status}")
    check("protected endpoint without token -> 401", call("GET", "/api/products")[0] == 401)
    check("garbage token -> 401", call("GET", "/api/products", token="not.a.jwt")[0] == 401)

    tokens = {}
    for user, pw in (("admin", "Admin@12345"), ("manager", "Manager@12345"), ("cashier", "Cashier@12345")):
        status, body = login(user, pw)
        check(f"login as {user}", status == 200 and body.get("token"), f"{status} {body}")
        if status != 200:
            print("Cannot continue without demo logins (was the backend started with the demo seed?)")
            sys.exit(1)
        tokens[user] = body["token"]
    admin, manager, cashier = tokens["admin"], tokens["manager"], tokens["cashier"]

    # ---- role-based access
    for path in ("/api/users", "/api/audit-logs", "/api/dashboard", "/api/suppliers", "/api/purchases", "/api/reports/sales"):
        check(f"cashier blocked from {path}", call("GET", path, token=cashier)[0] == 403)
    check("manager can open dashboard", call("GET", "/api/dashboard", token=manager)[0] == 200)
    check("manager blocked from /api/users", call("GET", "/api/users", token=manager)[0] == 403)
    status, users = call("GET", "/api/users", token=admin)
    check("admin can list users, no password hash exposed", status == 200 and users and "passwordHash" not in users[0])

    status, page = call("GET", "/api/products?size=100", token=cashier)
    check("cashier product list hides cost price", status == 200 and all(p["costPrice"] is None for p in page["content"]))

    # ---- pick a product with plenty of stock
    status, page = call("GET", "/api/products?size=100", token=manager)
    candidates = [p for p in page["content"] if p["quantity"] >= 10]
    check("demo data has products with stock", len(candidates) >= 2)
    p1, p2 = candidates[0], candidates[1]
    before = p1["quantity"]

    # ---- POS: sale reduces stock and records payment
    status, sale = call("POST", "/api/sales", {"items": [{"productId": p1["id"], "quantity": 2}], "paymentMethod": "CASH"}, cashier)
    check("cashier checkout -> 201", status == 201, f"{status} {sale}")
    if status == 201:
        check("receipt number issued", sale["receiptNumber"].startswith("SP-"))
        check("sale total = unit price x qty", abs(sale["total"] - 2 * p1["sellingPrice"]) < 0.005, str(sale["total"]))
        check("cashier does not see cost of goods", sale["cogs"] is None)
        check("stock reduced by 2", stock(manager, p1["id"]) == before - 2)
        status, mv = call("GET", f"/api/inventory/movements?productId={p1['id']}&type=SALE", token=manager)
        check("stock movement recorded with balance", status == 200 and mv["content"][0]["quantityChange"] == -2
              and mv["content"][0]["quantityAfter"] == before - 2)

        # ---- void restores stock; only managers; only once
        check("cashier cannot void", call("POST", f"/api/sales/{sale['id']}/void", {"reason": "oops"}, cashier)[0] == 403)
        status, voided = call("POST", f"/api/sales/{sale['id']}/void", {"reason": "smoke test"}, manager)
        check("manager voids sale", status == 200 and voided["status"] == "VOIDED", f"{status}")
        check("void restored stock", stock(manager, p1["id"]) == before)
        check("second void rejected (409)", call("POST", f"/api/sales/{sale['id']}/void", {"reason": "again"}, manager)[0] == 409)

    # ---- rollback: a multi-line sale with one short line changes nothing
    s1, s2 = stock(manager, p1["id"]), stock(manager, p2["id"])
    status, err = call("POST", "/api/sales", {"items": [{"productId": p1["id"], "quantity": 1},
                                                       {"productId": p2["id"], "quantity": s2 + 5}], "paymentMethod": "CASH"}, cashier)
    check("insufficient stock -> 409", status == 409, f"{status}")
    check("failed sale left BOTH products untouched", stock(manager, p1["id"]) == s1 and stock(manager, p2["id"]) == s2)

    # ---- discount permissions (100% discount)
    full = {"items": [{"productId": p1["id"], "quantity": 1}], "discountAmount": p1["sellingPrice"], "paymentMethod": "OTHER"}
    check("cashier 100% discount -> 403", call("POST", "/api/sales", full, cashier)[0] == 403)
    status, discounted = call("POST", "/api/sales", full, manager)
    check("manager may discount; total is 0", status == 201 and discounted["total"] == 0, f"{status}")

    # ---- negative stock impossible via adjustment
    cur = stock(manager, p1["id"])
    status, _ = call("POST", "/api/inventory/movements", {"productId": p1["id"], "type": "ADJUSTMENT",
                                                         "quantity": -(cur + 1), "reason": "smoke test"}, manager)
    check("adjustment below zero -> 409", status == 409 and stock(manager, p1["id"]) == cur, f"{status}")

    # ---- purchasing: approve first, receive once
    cur = stock(manager, p1["id"])
    status, po = call("POST", "/api/purchases", {"supplierId": 1, "notes": "smoke test",
                                                 "items": [{"productId": p1["id"], "quantity": 10, "unitCost": 1.5}]}, manager)
    check("create purchase order", status == 201 and po["status"] == "PENDING", f"{status} {po}")
    if status == 201:
        check("cannot receive before approval", call("POST", f"/api/purchases/{po['id']}/receive", token=manager)[0] == 409)
        check("approve", call("POST", f"/api/purchases/{po['id']}/approve", token=manager)[0] == 200)
        status, rec = call("POST", f"/api/purchases/{po['id']}/receive", token=manager)
        check("receive", status == 200 and rec["status"] == "RECEIVED", f"{status}")
        check("stock increased by 10", stock(manager, p1["id"]) == cur + 10)
        check("receiving twice rejected", call("POST", f"/api/purchases/{po['id']}/receive", token=manager)[0] == 409)
        check("stock unchanged by 2nd receive", stock(manager, p1["id"]) == cur + 10)

    # ---- validation and conflicts
    status, err = call("POST", "/api/products", {"sku": "", "name": "", "costPrice": -1, "sellingPrice": 2}, manager)
    check("invalid product -> 400 with field errors", status == 400 and err.get("fieldErrors") and "sku" in err["fieldErrors"], f"{status}")
    check("duplicate SKU -> 409", call("POST", "/api/products", {"sku": "bev-001", "name": "Dup", "costPrice": 1, "sellingPrice": 2}, manager)[0] == 409)

    # ---- reports + audit
    status, rep = call("GET", "/api/reports/sales?grain=month", token=manager)
    t = rep["totals"] if status == 200 else {}
    check("report: revenue - COGS = gross profit", status == 200 and abs(t["revenue"] - t["cogs"] - t["grossProfit"]) < 0.01, str(t))
    check("report: bad grain -> 400", call("GET", "/api/reports/sales?grain=decade", token=manager)[0] == 400)
    status, audit = call("GET", "/api/audit-logs?action=SALE_CREATED", token=admin)
    check("audit log records sales", status == 200 and audit["totalElements"] > 0)
    status, audit = call("GET", "/api/audit-logs?action=LOGIN_FAILED", token=admin)
    check("audit log records failed logins", status == 200 and audit["totalElements"] > 0)

    passed, total = sum(results), len(results)
    print(f"\n{passed}/{total} checks passed")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
